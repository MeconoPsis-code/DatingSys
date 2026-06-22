/**
 * @file group-sync.service.ts
 * @description 群成员同步服务
 *
 * 定期拉取 QQ 群成员列表，与网站已验证账号对比，
 * 将已退群但未被事件捕获的用户标记为 LEFT_PENDING_REVIEW。
 */

import { db } from '@/lib/db';
import { redis } from '@/lib/redis';
import { napcatClient } from './clients/napcat.client';
import { BOT_CONFIG } from './bot.config';
import { logBotAudit, BOT_AUDIT_ACTIONS } from './bot-audit.service';
import { createLogger } from '@/lib/logger';
import { MembershipStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';

const log = createLogger('bot:group-sync');

/** Redis key for tracking last sync timestamp */
const LAST_SYNC_KEY = 'bot:group-sync:last-run';

/** Sync interval: 15 days in seconds */
const SYNC_INTERVAL_SECONDS = 15 * 24 * 60 * 60;

export interface GroupSyncResult {
  /** Total members in QQ group */
  groupMemberCount: number;
  /** Total verified accounts on website */
  verifiedAccountCount: number;
  /** Users found missing from group and marked for review */
  markedForReview: string[];
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

  const elapsed = Math.floor(Date.now() / 1000) - parseInt(lastRun, 10);
  return elapsed >= SYNC_INTERVAL_SECONDS;
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
 * 2. Get all VERIFIED website accounts
 * 3. Find accounts whose QQ number is NOT in the group
 * 4. Mark them as LEFT_PENDING_REVIEW
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
      throw new Error(`Sync not due yet. Last sync: ${lastSync}. Interval: ${SYNC_INTERVAL_SECONDS / 86400} days.`);
    }
  }

  log.info({ groupId, force: options.force }, 'Starting group member sync');

  // 1. Fetch QQ group member list
  const groupMembers = await napcatClient.getGroupMemberList(groupId);
  const groupQQNumbers = new Set(groupMembers.map((m) => m.qqNumber));

  log.info({ groupId, memberCount: groupMembers.length }, 'Fetched group member list');

  // 2. Get all VERIFIED website accounts with a groupId matching our target
  const verifiedAccounts = await db.groupMembership.findMany({
    where: {
      status: MembershipStatus.VERIFIED,
      groupId,
    },
    include: {
      user: {
        select: { id: true, qqNumber: true },
      },
    },
  });

  log.info({ verifiedCount: verifiedAccounts.length }, 'Found verified accounts');

  // 3. Compare and find missing members
  const result: GroupSyncResult = {
    groupMemberCount: groupMembers.length,
    verifiedAccountCount: verifiedAccounts.length,
    markedForReview: [],
    alreadyPending: [],
    errors: [],
    syncedAt: new Date().toISOString(),
  };

  for (const membership of verifiedAccounts) {
    const qqNumber = membership.user.qqNumber;

    if (!qqNumber) continue;

    // Skip if the user is still in the group
    if (groupQQNumbers.has(qqNumber)) continue;

    // User is NOT in the group — mark for review
    try {
      await db.groupMembership.update({
        where: { id: membership.id },
        data: {
          status: MembershipStatus.LEFT_PENDING_REVIEW,
          leftDetectedAt: new Date(),
          leaveType: 'sync_detected',
          reviewReason: '定期群成员同步检测到用户已不在目标 QQ 群',
        },
      });

      // Remove from match pool
      await db.matchSnapshot.deleteMany({
        where: {
          OR: [
            { userId: membership.user.id },
            { targetUserId: membership.user.id },
          ],
        },
      });

      // Create admin review
      await db.adminReview.create({
        data: {
          type: 'group_membership_left',
          userId: membership.user.id,
          status: 'pending',
          reason: '定期群成员同步检测到用户已不在目标 QQ 群，系统已自动将其移出匹配库，等待管理员核实。',
          metadata: {
            qqNumber,
            groupId,
            leaveType: 'sync_detected',
            detectedAt: new Date().toISOString(),
            detectedBy: 'group_sync_service',
          } as Prisma.InputJsonValue,
        },
      });

      // Audit log
      await logBotAudit({
        action: BOT_AUDIT_ACTIONS.BOT_MEMBER_LEFT_PENDING_REVIEW,
        qqNumber,
        groupId,
        metadata: { userId: membership.user.id, leaveType: 'sync_detected' },
      });

      result.markedForReview.push(qqNumber);
      log.info({ qqNumber, userId: membership.user.id }, 'User not in group, marked LEFT_PENDING_REVIEW');
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      result.errors.push(`${qqNumber}: ${errMsg}`);
      log.error({ err, qqNumber }, 'Failed to process missing member');
    }
  }

  // 4. Record sync timestamp
  await redis.set(LAST_SYNC_KEY, Math.floor(Date.now() / 1000).toString());

  log.info(
    {
      groupMemberCount: result.groupMemberCount,
      verifiedAccountCount: result.verifiedAccountCount,
      markedForReview: result.markedForReview.length,
      errors: result.errors.length,
    },
    'Group member sync completed'
  );

  return result;
}
