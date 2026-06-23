import type { BotGroupMessageEvent, BotCommandResult } from './bot.types';
import type { QQBotClient } from './clients/qqbot-client.interface';
import { getQQEmail } from './bot.config';
import { getReplyMessage } from './bot-command-result';
import { checkBotRateLimit, recordBotCommandUsage } from './bot-rate-limiter';
import { syncAvatar } from './avatar-sync.service';
import { logBotAction, logBotAudit, BOT_AUDIT_ACTIONS } from './bot-audit.service';
import { db } from '@/lib/db';
import { redis } from '@/lib/redis';
import { generateAndStoreCode, isRateLimited } from '@/lib/verification';
import { sendVerificationCode } from '@/lib/email';
import { createLogger } from '@/lib/logger';
import { normalizeNicknameInput } from '@/lib/group-card';

const log = createLogger('bot:register');

/**
 * Handle the /signup command from QQ group.
 *
 * Wraps the existing bot-signup logic:
 * 1. Rate-limit check (bot-level + verification module)
 * 2. Check if already registered
 * 3. Generate verification code → send via email
 * 4. Upsert BotIdentity record
 * 5. Send reply message to group (@ the user)
 */
export async function handleRegisterCommand(
  event: BotGroupMessageEvent,
  botClient: QQBotClient
): Promise<void> {
  const { qqNumber, groupId } = event;
  const email = getQQEmail(qqNumber);

  // 1. Log command received
  await logBotAudit({
    action: BOT_AUDIT_ACTIONS.BOT_REGISTER_COMMAND_RECEIVED,
    qqNumber,
    groupId,
  });

  let result: BotCommandResult;

  try {
    // 2. Check bot rate limit
    const rateCheck = await checkBotRateLimit(qqNumber, 'register');
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

    // 3. Fetch group member info (nickname, avatar) from NapCat
    let nickname: string | null = null;
    let avatarUrl: string | null = null;
    let groupCard: string | null = null;
    try {
      const memberInfo = await botClient.getGroupMemberInfo(groupId, qqNumber);
      nickname = normalizeNicknameInput(memberInfo.card || memberInfo.nickname || '') || null;
      groupCard = memberInfo.card || null;
      avatarUrl = memberInfo.avatarUrl || null;
      log.info({ qqNumber, nickname, groupCard }, 'Fetched group member info');
    } catch (err) {
      log.warn({ err, qqNumber }, 'Failed to fetch group member info (non-critical)');
    }

    // 4. Sync avatar to BotIdentity (non-critical)
    try {
      await syncAvatar(qqNumber);
    } catch (err) {
      log.warn({ err, qqNumber }, 'Avatar sync failed (non-critical)');
    }

    // 5. Check if already registered
    const existingUser = await db.user.findFirst({
      where: { qqNumber },
    });

    if (existingUser && existingUser.passwordHash) {
      result = {
        success: false,
        code: 'ALREADY_REGISTERED',
        message: '已注册',
        qqNumber,
        email,
        shouldMentionUser: true,
      };
      await sendReply(botClient, groupId, qqNumber, result);
      return;
    }

    // 6. Check existing verification rate limit (60s from verification module)
    if (await isRateLimited(qqNumber)) {
      result = {
        success: false,
        code: 'EMAIL_CODE_STILL_VALID',
        message: '验证码仍有效',
        qqNumber,
        email,
        shouldMentionUser: true,
      };
      await sendReply(botClient, groupId, qqNumber, result);
      return;
    }

    // 7. Store bot context for later use during set-passcode
    const contextKey = `auth:context:${qqNumber}`;
    await redis.setex(
      contextKey,
      900, // 15 min
      JSON.stringify({ groupId, nickname, avatarUrl, groupCard })
    );

    // 7. Generate code and send email
    const code = await generateAndStoreCode(qqNumber);
    await sendVerificationCode(qqNumber, code);

    // 8. Record rate limit usage
    await recordBotCommandUsage(qqNumber, 'register');

    // 9. Upsert BotIdentity
    await db.botIdentity.upsert({
      where: { qqNumber },
      update: {
        lastCommandAt: new Date(),
        groupId,
      },
      create: {
        qqNumber,
        qqEmail: email,
        groupId,
        registeredFromGroupId: groupId,
        lastCommandAt: new Date(),
      },
    });

    result = {
      success: true,
      code: 'REGISTER_CODE_SENT',
      message: '验证码已发送',
      qqNumber,
      email,
      shouldMentionUser: true,
    };
  } catch (err) {
    log.error({ err, qqNumber }, 'Register command failed');
    result = {
      success: false,
      code: 'SYSTEM_ERROR',
      message: '系统错误',
      qqNumber,
      email,
      shouldMentionUser: true,
    };
  }

  // 10. Send reply
  await sendReply(botClient, groupId, qqNumber, result);

  // 11. Log result
  await logBotAudit({
    action: BOT_AUDIT_ACTIONS.BOT_REGISTER_COMMAND_RESULT_RETURNED,
    qqNumber,
    groupId,
    metadata: { code: result.code, success: result.success },
  });
}

/**
 * Send a reply message to the group, @-mentioning the user.
 * Logs both success and failure.
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
      action: 'send_register_reply',
      groupId,
      qqNumber,
      status: 'success',
      request: { code: result.code },
    });

    await logBotAudit({
      action: BOT_AUDIT_ACTIONS.BOT_COMMAND_REPLY_SENT,
      qqNumber,
      groupId,
      metadata: { command: '/signup', code: result.code },
    });
  } catch (err) {
    log.error({ err, qqNumber, groupId }, 'Failed to send register reply');

    await logBotAction({
      action: 'send_register_reply',
      groupId,
      qqNumber,
      status: 'failed',
      errorMessage: err instanceof Error ? err.message : 'Unknown error',
    });

    await logBotAudit({
      action: BOT_AUDIT_ACTIONS.BOT_COMMAND_REPLY_FAILED,
      qqNumber,
      groupId,
      metadata: { command: '/signup', error: err instanceof Error ? err.message : 'Unknown' },
    });
  }
}
