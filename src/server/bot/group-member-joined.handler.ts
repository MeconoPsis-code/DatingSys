import type { BotGroupMemberJoinedEvent } from './bot.types';
import type { QQBotClient } from './clients/qqbot-client.interface';
import { logBotAudit, BOT_AUDIT_ACTIONS } from './bot-audit.service';
import { createLogger } from '@/lib/logger';

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

  // 2. Send welcome message with @mention
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
