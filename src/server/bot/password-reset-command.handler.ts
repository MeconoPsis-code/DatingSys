import type { BotGroupMessageEvent, BotCommandResult } from './bot.types';
import type { QQBotClient } from './clients/qqbot-client.interface';
import { getQQEmail } from './bot.config';
import { getReplyMessage } from './bot-command-result';
import { checkBotRateLimit, recordBotCommandUsage } from './bot-rate-limiter';
import { logBotAction, logBotAudit, BOT_AUDIT_ACTIONS } from './bot-audit.service';
import { db } from '@/lib/db';
import { generateAndStoreCode, isRateLimited } from '@/lib/verification';
import { sendVerificationCode } from '@/lib/email';
import { createLogger } from '@/lib/logger';
import { UserStatus } from '@prisma/client';

const log = createLogger('bot:password-reset');

/**
 * Handle the /reset password command from QQ group.
 *
 * Flow:
 * 1. Rate-limit check
 * 2. Look up user by QQ number → fail if not found
 * 3. Check user status (BANNED / DELETED)
 * 4. Generate verification code → send via email
 * 5. Reply to group
 */
export async function handlePasswordResetCommand(
  event: BotGroupMessageEvent,
  botClient: QQBotClient
): Promise<void> {
  const { qqNumber, groupId } = event;
  const email = getQQEmail(qqNumber);

  // 1. Log command received
  await logBotAudit({
    action: BOT_AUDIT_ACTIONS.BOT_PASSWORD_RESET_COMMAND_RECEIVED,
    qqNumber,
    groupId,
  });

  let result: BotCommandResult;

  try {
    // 2. Check bot rate limit
    const rateCheck = await checkBotRateLimit(qqNumber, 'password_reset');
    if (!rateCheck.allowed) {
      result = {
        success: false,
        code: 'RATE_LIMITED',
        message: '操作过于频繁',
        qqNumber,
        email,
        shouldMentionUser: true,
      };
      await sendReply(botClient, groupId, qqNumber, result);
      return;
    }

    // 3. Look up user
    const user = await db.user.findFirst({
      where: { qqNumber },
    });

    if (!user || !user.passwordHash) {
      result = {
        success: false,
        code: 'ACCOUNT_NOT_FOUND',
        message: '未找到账号',
        qqNumber,
        email,
        shouldMentionUser: true,
      };
      await sendReply(botClient, groupId, qqNumber, result);
      return;
    }

    // 4. Check user status
    if (user.status === UserStatus.BANNED) {
      result = {
        success: false,
        code: 'ACCOUNT_BANNED',
        message: '账号已封禁',
        qqNumber,
        email,
        shouldMentionUser: true,
      };
      await sendReply(botClient, groupId, qqNumber, result);
      return;
    }

    if (user.status === UserStatus.DELETED) {
      result = {
        success: false,
        code: 'ACCOUNT_DELETED',
        message: '账号已删除',
        qqNumber,
        email,
        shouldMentionUser: true,
      };
      await sendReply(botClient, groupId, qqNumber, result);
      return;
    }

    // 5. Check verification rate limit (60s from verification module)
    if (await isRateLimited(qqNumber)) {
      result = {
        success: false,
        code: 'RESET_PASSWORD_EMAIL_STILL_VALID',
        message: '验证码仍有效',
        qqNumber,
        email,
        shouldMentionUser: true,
      };
      await sendReply(botClient, groupId, qqNumber, result);
      return;
    }

    // 6. Generate code and send email
    const code = await generateAndStoreCode(qqNumber);
    await sendVerificationCode(qqNumber, code);

    // 7. Record rate limit usage
    await recordBotCommandUsage(qqNumber, 'password_reset');

    result = {
      success: true,
      code: 'RESET_PASSWORD_EMAIL_SENT',
      message: '密码重置验证码已发送',
      qqNumber,
      email,
      shouldMentionUser: true,
    };
  } catch (err) {
    log.error({ err, qqNumber }, 'Password reset command failed');
    result = {
      success: false,
      code: 'SYSTEM_ERROR',
      message: '系统错误',
      qqNumber,
      email,
      shouldMentionUser: true,
    };
  }

  // 8. Send reply
  await sendReply(botClient, groupId, qqNumber, result);

  // 9. Log result
  await logBotAudit({
    action: BOT_AUDIT_ACTIONS.BOT_PASSWORD_RESET_RESULT_RETURNED,
    qqNumber,
    groupId,
    metadata: { code: result.code, success: result.success },
  });
}

/**
 * Send a reply message to the group, @-mentioning the user.
 */
async function sendReply(
  botClient: QQBotClient,
  groupId: string,
  qqNumber: string,
  result: BotCommandResult
): Promise<void> {
  const replyText = getReplyMessage(result);

  try {
    await botClient.sendGroupMessage(groupId, {
      type: 'at',
      content: replyText,
      atQQNumber: qqNumber,
    });

    await logBotAction({
      action: 'send_password_reset_reply',
      groupId,
      qqNumber,
      status: 'success',
      request: { code: result.code },
    });

    await logBotAudit({
      action: BOT_AUDIT_ACTIONS.BOT_COMMAND_REPLY_SENT,
      qqNumber,
      groupId,
      metadata: { command: '/reset password', code: result.code },
    });
  } catch (err) {
    log.error({ err, qqNumber, groupId }, 'Failed to send password reset reply');

    await logBotAction({
      action: 'send_password_reset_reply',
      groupId,
      qqNumber,
      status: 'failed',
      errorMessage: err instanceof Error ? err.message : 'Unknown error',
    });

    await logBotAudit({
      action: BOT_AUDIT_ACTIONS.BOT_COMMAND_REPLY_FAILED,
      qqNumber,
      groupId,
      metadata: { command: '/reset password', error: err instanceof Error ? err.message : 'Unknown' },
    });
  }
}
