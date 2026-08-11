import type { BotGroupMemberLeftEvent } from './bot.types';
import { logBotAudit, BOT_AUDIT_ACTIONS } from './bot-audit.service';
import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import { MembershipStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { getGroupMembershipSyncAction } from '@/lib/group-membership-sync';

const log = createLogger('bot:member-left');

/**
 * Handle a member leaving or being kicked from the target QQ group.
 *
 * Flow:
 * 1. Log the event
 * 2. Look up bound user by QQ number
 * 3. If unbound → log and skip
 * 4. If already in LEFT_PENDING_REVIEW → skip duplicate
 * 5. Update GroupMembership status to LEFT_PENDING_REVIEW
 * 6. Remove from match pool (delete MatchSnapshots)
 * 7. Create AdminReview for manual confirmation
 */
export async function handleGroupMemberLeft(
  event: BotGroupMemberLeftEvent
): Promise<void> {
  const { qqNumber, groupId, leaveType } = event;

  // 1. Log event
  await logBotAudit({
    action: BOT_AUDIT_ACTIONS.BOT_MEMBER_LEFT_DETECTED,
    qqNumber,
    groupId,
    metadata: { leaveType },
  });

  // 2. Find user by QQ number
  const user = await db.user.findFirst({
    where: { qqNumber },
    include: { groupMembership: true },
  });

  if (!user || !user.groupMembership) {
    // Unbound user — just log
    await logBotAudit({
      action: BOT_AUDIT_ACTIONS.BOT_MEMBER_LEFT_UNBOUND_USER,
      qqNumber,
      groupId,
    });
    log.info({ qqNumber }, 'Unbound user left group, no action needed');
    return;
  }

  const membership = user.groupMembership;

  // 3. Check if already in review (prevent duplicate processing)
  if (membership.status === MembershipStatus.LEFT_PENDING_REVIEW) {
    log.info({ qqNumber }, 'User already in LEFT_PENDING_REVIEW, skipping duplicate');
    return;
  }

  // Rejected/revoked/expired users must never pass through a restorable leave
  // status, otherwise a later join event could accidentally re-verify them.
  if (getGroupMembershipSyncAction(membership.status, false) !== 'MARK_LEFT') {
    log.info(
      { qqNumber, membershipStatus: membership.status },
      'Non-active membership left group, keeping its current status'
    );
    return;
  }

  // 4-6. Change status, remove cached matches and create exactly one review atomically.
  const now = new Date();
  const marked = await db.$transaction(async (tx) => {
    const updated = await tx.groupMembership.updateMany({
      where: {
        id: membership.id,
        status: { in: [MembershipStatus.VERIFIED, MembershipStatus.RESTORED] },
      },
      data: {
        status: MembershipStatus.LEFT_PENDING_REVIEW,
        leftDetectedAt: now,
        leaveType,
        reviewReason: 'Bot 检测到用户已退出目标 QQ 群',
        rawEvent: event.rawEvent as Prisma.InputJsonValue,
      },
    });
    if (updated.count === 0) return false;

    await tx.matchSnapshot.deleteMany({
      where: {
        OR: [{ userId: user.id }, { targetUserId: user.id }],
      },
    });

    await tx.adminReview.create({
      data: {
        type: 'group_membership_left',
        userId: user.id,
        status: 'pending',
        reason:
          'Bot 检测到用户已退出目标 QQ 群，系统已自动将其移出匹配库，等待管理员核实。',
        metadata: {
          qqNumber,
          groupId,
          leaveType,
          detectedAt: now.toISOString(),
        } as Prisma.InputJsonValue,
      },
    });

    return true;
  });

  if (!marked) {
    log.info({ qqNumber }, 'Membership changed while leave event was processing');
    return;
  }

  // 7. Log
  await logBotAudit({
    action: BOT_AUDIT_ACTIONS.BOT_MEMBER_LEFT_PENDING_REVIEW,
    qqNumber,
    groupId,
    metadata: { userId: user.id, leaveType },
  });

  log.info({ qqNumber, userId: user.id, leaveType }, 'User marked as LEFT_PENDING_REVIEW');
}
