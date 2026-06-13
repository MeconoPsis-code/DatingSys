import type { BotGroupMemberLeftEvent } from './bot.types';
import type { QQBotClient } from './clients/qqbot-client.interface';
import { logBotAudit, BOT_AUDIT_ACTIONS } from './bot-audit.service';
import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import { MembershipStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';

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
  event: BotGroupMemberLeftEvent,
  botClient: QQBotClient
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

  // 4. Update membership status
  await db.groupMembership.update({
    where: { id: membership.id },
    data: {
      status: MembershipStatus.LEFT_PENDING_REVIEW,
      leftDetectedAt: new Date(),
      leaveType,
      reviewReason: 'Bot 检测到用户已退出目标 QQ 群',
      rawEvent: event.rawEvent as Prisma.InputJsonValue,
    },
  });

  // 5. Remove from match pool (delete match snapshots)
  await db.matchSnapshot.deleteMany({
    where: {
      OR: [
        { userId: user.id },
        { targetUserId: user.id },
      ],
    },
  });

  // 6. Create admin review
  await db.adminReview.create({
    data: {
      type: 'group_membership_left',
      userId: user.id,
      status: 'pending',
      reason: 'Bot 检测到用户已退出目标 QQ 群，系统已自动将其移出匹配库，等待管理员核实。',
      metadata: {
        qqNumber,
        groupId,
        leaveType,
        detectedAt: new Date().toISOString(),
      } as Prisma.InputJsonValue,
    },
  });

  // 7. Log
  await logBotAudit({
    action: BOT_AUDIT_ACTIONS.BOT_MEMBER_LEFT_PENDING_REVIEW,
    qqNumber,
    groupId,
    metadata: { userId: user.id, leaveType },
  });

  log.info({ qqNumber, userId: user.id, leaveType }, 'User marked as LEFT_PENDING_REVIEW');
}
