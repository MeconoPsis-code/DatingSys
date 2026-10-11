import type { BotGroupMemberJoinedEvent } from './bot.types';
import type { QQBotClient } from './clients/qqbot-client.interface';
import { logBotAudit, BOT_AUDIT_ACTIONS } from './bot-audit.service';
import { createLogger } from '@/lib/logger';
import { restoreGroupMemberIfNeeded } from './group-sync.service';
import { db } from '@/lib/db';
import { lockRatingUserTasks } from '@/lib/rating-profile-sync';
import { syncMembershipGroupCardsInTransaction } from './group-card-sync.service';

const log = createLogger('bot:member-joined');

/** Welcome message sent to new group members */
const WELCOME_MESSAGE = `如需使用 TenMatch 匹配系统，

请查看群公告中的注意事项及TenMatch匹配系统入口。

根据系统指引完成用户注册

注册过程中，请务必保证您当前帐户的QQ邮箱收件功能正常

本系统为自愿使用，不强制注册。`;

/**
 * Handle a new member joining the target QQ group.
 *
 * Sends a welcome message with registration instructions.
 */
export async function handleGroupMemberJoined(
  event: BotGroupMemberJoinedEvent,
  botClient: QQBotClient
): Promise<void> {
  const { qqNumber, groupId } = event;

  // 1. Log event
  await logBotAudit({
    action: BOT_AUDIT_ACTIONS.BOT_GROUP_MEMBER_JOINED,
    qqNumber,
    groupId,
  });

  // 2. Restore an existing website account immediately when a former member rejoins.
  try {
    await restoreGroupMemberIfNeeded({ qqNumber, groupId });
    const user = await db.user.findUnique({ where: { qqNumber }, include: { groupMembership: true } });
    if (user?.status === "ACTIVE" && user.groupMembership?.groupId === groupId &&
        ["VERIFIED", "RESTORED"].includes(user.groupMembership.status)) {
      await db.$transaction(async (tx) => {
        await lockRatingUserTasks(tx, user.id);
        const workspace = await tx.workspace.findUnique({ where: { qqGroupId: groupId }, select: { id: true } });
        if (workspace) {
          await tx.workspaceMember.upsert({
            where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
            create: { workspaceId: workspace.id, userId: user.id, role: "MEMBER" },
            update: { leftAt: null, joinedAt: new Date() },
          });
          await syncMembershipGroupCardsInTransaction(tx, user.id, { groupId, left: false });
        }
      });
    }
  } catch (err) {
    // Welcome delivery should not be blocked; the daily full sync will retry restoration.
    log.error({ err, qqNumber, groupId }, 'Failed to restore returning group member');
  }

  // 3. Send welcome message with @mention
  try {
    await botClient.sendGroupMessage(groupId, {
      type: 'at',
      content: WELCOME_MESSAGE,
      atQQNumber: qqNumber,
    });

    await logBotAudit({
      action: BOT_AUDIT_ACTIONS.BOT_REGISTER_GUIDE_SENT,
      qqNumber,
      groupId,
    });

    log.info({ qqNumber, groupId }, 'Welcome message sent to new member');
  } catch (err) {
    log.error({ err, qqNumber, groupId }, 'Failed to send welcome message');
  }
}
