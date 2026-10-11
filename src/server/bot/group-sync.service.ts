/**
 * @file group-sync.service.ts
 * @description 群成员同步服务
 *
 * 定期拉取 QQ 群成员列表，与网站已绑定账号双向对比：
 * - 不在群中的正常用户标记为 LEFT_PENDING_REVIEW
 * - 已重新入群的退群用户恢复为 VERIFIED
 */

import { db } from '@/lib/db';
import { redis } from '@/lib/redis';
import { napcatClient } from './clients/napcat.client';
import { BOT_CONFIG } from './bot.config';
import { logBotAudit, BOT_AUDIT_ACTIONS } from './bot-audit.service';
import { createLogger } from '@/lib/logger';
import { MembershipStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import {
  getGroupMembershipSyncAction,
  GROUP_MEMBERSHIP_SYNC_INTERVAL_SECONDS,
} from '@/lib/group-membership-sync';

import { syncMembershipGroupCardsInTransaction } from './group-card-sync.service';
import { lockRatingUserTasks } from '@/lib/rating-profile-sync';

const log = createLogger('bot:group-sync');

/** Redis key for tracking last sync timestamp */
const LAST_SYNC_KEY = 'bot:group-sync:last-run';

const RECONCILABLE_MEMBERSHIP_STATUSES: MembershipStatus[] = [
  MembershipStatus.VERIFIED,
  MembershipStatus.RESTORED,
  MembershipStatus.LEFT_PENDING_REVIEW,
  MembershipStatus.LEFT_CONFIRMED,
];

const ACTIVE_MEMBERSHIP_STATUSES: MembershipStatus[] = [
  MembershipStatus.VERIFIED,
  MembershipStatus.RESTORED,
];

const RESTORABLE_MEMBERSHIP_STATUSES: MembershipStatus[] = [
  MembershipStatus.RESTORED,
  MembershipStatus.LEFT_PENDING_REVIEW,
  MembershipStatus.LEFT_CONFIRMED,
];

export interface GroupSyncResult {
  /** Total members in QQ group */
  groupMemberCount: number;
  /** Total verified accounts on website */
  verifiedAccountCount: number;
  /** Total linked website accounts checked */
  checkedAccountCount: number;
  /** Users found missing from group and marked for review */
  markedForReview: string[];
  /** Returning users restored to normal verified status */
  restoredMemberships: string[];
  /** Users already in LEFT_PENDING_REVIEW (skipped) */
  alreadyPending: string[];
  /** Errors during processing */
  errors: string[];
  /** Timestamp of this sync */
  syncedAt: string;
}

/**
 * Check if a sync is due based on the configured interval.
 * Returns true if enough time has passed since the last sync.
 */
export async function isSyncDue(): Promise<boolean> {
  const lastRun = await redis.get(LAST_SYNC_KEY);
  if (!lastRun) return true;

  const lastRunSeconds = Number.parseInt(lastRun, 10);
  if (!Number.isFinite(lastRunSeconds)) return true;

  const elapsed = Math.floor(Date.now() / 1000) - lastRunSeconds;
  return elapsed >= GROUP_MEMBERSHIP_SYNC_INTERVAL_SECONDS;
}

/**
 * Get the timestamp of the last sync run.
 */
export async function getLastSyncTime(): Promise<string | null> {
  const lastRun = await redis.get(LAST_SYNC_KEY);
  if (!lastRun) return null;
  return new Date(parseInt(lastRun, 10) * 1000).toISOString();
}

/**
 * Perform a full group member sync.
 *
 * 1. Fetch the QQ group member list via NapCat API
 * 2. Get all linked accounts whose membership is verified or in a leave state
 * 3. Mark verified accounts missing from the group as LEFT_PENDING_REVIEW
 * 4. Restore returning accounts to VERIFIED and resolve stale leave reviews
 * 5. Record sync timestamp in Redis
 */
export async function syncGroupMembers(
  options: { force?: boolean } = {}
): Promise<GroupSyncResult> {
  const groupId = BOT_CONFIG.targetGroupId;

  if (!groupId) {
    throw new Error('BOT_TARGET_GROUP_ID is not configured');
  }

  // Check if sync is needed (unless forced)
  if (!options.force) {
    const due = await isSyncDue();
    if (!due) {
      const lastSync = await getLastSyncTime();
      throw new Error(
        `Sync not due yet. Last sync: ${lastSync}. Interval: ${GROUP_MEMBERSHIP_SYNC_INTERVAL_SECONDS / 86400} day(s).`
      );
    }
  }

  log.info({ groupId, force: options.force }, 'Starting group member sync');

  // 1. Fetch QQ group member list
  const groupMembers = await napcatClient.getGroupMemberList(groupId);
  if (groupMembers.length === 0) {
    throw new Error(
      'NapCat returned an empty group member list; refusing to revoke every website membership'
    );
  }
  const groupQQNumbers = new Set(groupMembers.map((m) => m.qqNumber));

  log.info({ groupId, memberCount: groupMembers.length }, 'Fetched group member list');

  // 2. Get every linked account that can move between verified and leave states.
  const linkedAccounts = await db.groupMembership.findMany({
    where: {
      status: { in: RECONCILABLE_MEMBERSHIP_STATUSES },
      groupId,
      userId: { not: null },
    },
    include: {
      user: {
        select: { id: true, qqNumber: true },
      },
    },
  });

  const verifiedAccountCount = linkedAccounts.filter((membership) =>
    ACTIVE_MEMBERSHIP_STATUSES.includes(membership.status)
  ).length;

  log.info(
    { checkedAccountCount: linkedAccounts.length, verifiedAccountCount },
    'Found linked website accounts'
  );

  // 3. Compare and find missing members
  const result: GroupSyncResult = {
    groupMemberCount: groupMembers.length,
    verifiedAccountCount,
    checkedAccountCount: linkedAccounts.length,
    markedForReview: [],
    restoredMemberships: [],
    alreadyPending: [],
    errors: [],
    syncedAt: new Date().toISOString(),
  };

  for (const membership of linkedAccounts) {
    if (!membership.user) continue;

    const qqNumber = membership.qqNumber;

    const isInGroup = groupQQNumbers.has(qqNumber);
    const action = getGroupMembershipSyncAction(membership.status, isInGroup);

    if (
      action === 'NONE' &&
      !isInGroup &&
      membership.status === MembershipStatus.LEFT_PENDING_REVIEW
    ) {
      result.alreadyPending.push(qqNumber);
    }

    if (action === 'NONE') {
      // Keep actual sync membership aligned without altering legacy review decisions.
      if (!isInGroup) {
        try {
          await db.$transaction(async (tx) => {
            await lockRatingUserTasks(tx, membership.user!.id);
            const workspace = await tx.workspace.findUnique({ where: { qqGroupId: groupId }, select: { id: true } });
            if (!workspace) return;
            const repaired = await tx.workspaceMember.updateMany({
              where: { workspaceId: workspace.id, userId: membership.user!.id, leftAt: null },
              data: { leftAt: new Date() },
            });
            if (repaired.count) await syncMembershipGroupCardsInTransaction(tx, membership.user!.id, { groupId, left: true });
          });
        } catch (err) {
          result.errors.push(`${qqNumber}: ${err instanceof Error ? err.message : 'Membership repair failed'}`);
          log.error({ err, qqNumber }, 'Failed to repair stale sync membership');
        }
      }
      continue;
    }

    try {
      if (action === 'RESTORE') {
        const restored = await restoreMembership({
          membershipId: membership.id,
          userId: membership.user.id,
          qqNumber,
          groupId,
          source: 'daily_sync',
        });
        if (restored) result.restoredMemberships.push(qqNumber);
        continue;
      }

      const marked = await markMembershipLeft({
        membershipId: membership.id,
        userId: membership.user.id,
        qqNumber,
        groupId,
      });
      if (marked) result.markedForReview.push(qqNumber);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      result.errors.push(`${qqNumber}: ${errMsg}`);
      log.error({ err, qqNumber }, 'Failed to process missing member');
    }
  }

  // 4. Only advance the daily timestamp after a clean pass. Partial failures
  // are retried by the hourly scheduler instead of waiting another 24 hours.
  if (result.errors.length === 0) {
    await redis.set(LAST_SYNC_KEY, Math.floor(Date.now() / 1000).toString());
  }

  log.info(
    {
      groupMemberCount: result.groupMemberCount,
      verifiedAccountCount: result.verifiedAccountCount,
      checkedAccountCount: result.checkedAccountCount,
      markedForReview: result.markedForReview.length,
      restoredMemberships: result.restoredMemberships.length,
      errors: result.errors.length,
    },
    'Group member sync completed'
  );

  return result;
}

async function markMembershipLeft({
  membershipId,
  userId,
  qqNumber,
  groupId,
}: {
  membershipId: string;
  userId: string;
  qqNumber: string;
  groupId: string;
}): Promise<boolean> {
  const now = new Date();
  const marked = await db.$transaction(async (tx) => {
    await lockRatingUserTasks(tx, userId);
    const updated = await tx.groupMembership.updateMany({
      where: {
        id: membershipId,
        status: { in: ACTIVE_MEMBERSHIP_STATUSES },
      },
      data: {
        status: MembershipStatus.LEFT_PENDING_REVIEW,
        leftDetectedAt: now,
        leaveType: 'sync_detected',
        reviewReason: '每日群成员同步检测到用户已不在目标 QQ 群',
      },
    });
    if (updated.count === 0) return false;
    const workspace = await tx.workspace.findUnique({ where: { qqGroupId: groupId }, select: { id: true } });
    if (workspace) await tx.workspaceMember.updateMany({
      where: { workspaceId: workspace.id, userId }, data: { leftAt: now },
    });

    await tx.matchSnapshot.deleteMany({
      where: {
        OR: [{ userId }, { targetUserId: userId }],
      },
    });

    await tx.adminReview.create({
      data: {
        type: 'group_membership_left',
        userId,
        status: 'pending',
        reason:
          '每日群成员同步检测到用户已不在目标 QQ 群，系统已自动将其移出匹配库，等待管理员核实。',
        metadata: {
          qqNumber,
          groupId,
          leaveType: 'sync_detected',
          detectedAt: now.toISOString(),
          detectedBy: 'group_sync_service',
        } as Prisma.InputJsonValue,
      },
    });

    await syncMembershipGroupCardsInTransaction(tx, userId, { groupId, left: true });
    return true;
  });

  if (!marked) return false;

  await logBotAudit({
    action: BOT_AUDIT_ACTIONS.BOT_MEMBER_LEFT_PENDING_REVIEW,
    qqNumber,
    groupId,
    metadata: { userId, leaveType: 'sync_detected' },
  });
  log.info({ qqNumber, userId }, 'User not in group, marked LEFT_PENDING_REVIEW');
  return true;
}

async function restoreMembership({
  membershipId,
  userId,
  qqNumber,
  groupId,
  source,
}: {
  membershipId: string;
  userId: string;
  qqNumber: string;
  groupId: string;
  source: 'daily_sync' | 'join_event';
}): Promise<boolean> {
  const now = new Date();
  const restored = await db.$transaction(async (tx) => {
    await lockRatingUserTasks(tx, userId);
    const updated = await tx.groupMembership.updateMany({
      where: {
        id: membershipId,
        status: { in: RESTORABLE_MEMBERSHIP_STATUSES },
      },
      data: {
        status: MembershipStatus.VERIFIED,
        verifiedAt: now,
        restoredAt: now,
        leftDetectedAt: null,
        leftConfirmedAt: null,
        leaveType: null,
        reviewReason: null,
        reviewedBy: null,
        reviewRemark:
          source === 'join_event'
            ? '检测到重新入群，已自动恢复认证'
            : '每日同步确认仍在群内，已自动恢复认证',
      },
    });
    if (updated.count === 0) return false;
    const workspace = await tx.workspace.findUnique({ where: { qqGroupId: groupId }, select: { id: true } });
    if (workspace) await tx.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId } },
      create: { workspaceId: workspace.id, userId, role: "MEMBER" },
      update: { leftAt: null, joinedAt: now },
    });

    await tx.adminReview.updateMany({
      where: {
        type: 'group_membership_left',
        userId,
        status: 'pending',
      },
      data: {
        status: 'resolved',
        resolution: 'auto_restored',
        handledAt: now,
      },
    });

    await syncMembershipGroupCardsInTransaction(tx, userId, { groupId, left: false });
    return true;
  });

  if (!restored) return false;

  await logBotAudit({
    action: BOT_AUDIT_ACTIONS.BOT_MEMBER_RESTORED,
    qqNumber,
    groupId,
    metadata: { userId, source },
  });
  log.info({ qqNumber, userId, source }, 'Returning group member restored to VERIFIED');
  return true;
}

/** Restore a returning member immediately when the group join event is received. */
export async function restoreGroupMemberIfNeeded({
  qqNumber,
  groupId,
}: {
  qqNumber: string;
  groupId: string;
}): Promise<boolean> {
  const membership = await db.groupMembership.findFirst({
    where: {
      qqNumber,
      groupId,
      userId: { not: null },
      status: { in: RESTORABLE_MEMBERSHIP_STATUSES },
    },
    include: {
      user: { select: { id: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  if (!membership?.user) return false;

  return restoreMembership({
    membershipId: membership.id,
    userId: membership.user.id,
    qqNumber,
    groupId,
    source: 'join_event',
  });
}
