/**
 * @file bot-audit.service.ts
 * @description 机器人审计日志服务
 *
 * 在基础 AUDIT_ACTIONS 之上扩展了机器人专用的审计动作，
 * 并提供三种日志写入功能：
 *
 * 1. **logBotEvent**  — 原始入站事件 → BotEventLog 表
 * 2. **logBotAction** — 出站 API 调用 → BotActionLog 表
 * 3. **logBotAudit**  — 审计级别事件 → AuditLog 表（复用 logAudit）
 *
 * @module server/bot/bot-audit.service
 */

import { logAudit, AUDIT_ACTIONS as BASE_AUDIT_ACTIONS } from '@/lib/audit';
import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import type { Prisma } from '@prisma/client';

const log = createLogger('bot:audit');

// ── Bot-Specific Audit Actions ──────────────────────────

/**
 * 审计动作常量（包含基础动作 + 机器人扩展动作）。
 *
 * 所有 `BOT_` 前缀的动作仅由机器人模块使用。
 */
export const BOT_AUDIT_ACTIONS = {
  ...BASE_AUDIT_ACTIONS,

  // 注册命令
  BOT_REGISTER_COMMAND_RECEIVED: 'BOT_REGISTER_COMMAND_RECEIVED',
  BOT_REGISTER_COMMAND_RESULT_RETURNED: 'BOT_REGISTER_COMMAND_RESULT_RETURNED',

  // 密码重置命令
  BOT_PASSWORD_RESET_COMMAND_RECEIVED: 'BOT_PASSWORD_RESET_COMMAND_RECEIVED',
  BOT_PASSWORD_RESET_RESULT_RETURNED: 'BOT_PASSWORD_RESET_RESULT_RETURNED',

  // 命令回复
  BOT_COMMAND_REPLY_SENT: 'BOT_COMMAND_REPLY_SENT',
  BOT_COMMAND_REPLY_FAILED: 'BOT_COMMAND_REPLY_FAILED',

  // 群事件
  BOT_GROUP_MEMBER_JOINED: 'BOT_GROUP_MEMBER_JOINED',
  BOT_REGISTER_GUIDE_SENT: 'BOT_REGISTER_GUIDE_SENT',
  BOT_MEMBER_LEFT_DETECTED: 'BOT_MEMBER_LEFT_DETECTED',
  BOT_MEMBER_LEFT_PENDING_REVIEW: 'BOT_MEMBER_LEFT_PENDING_REVIEW',
  BOT_MEMBER_LEFT_UNBOUND_USER: 'BOT_MEMBER_LEFT_UNBOUND_USER',

  // 群名片
  BOT_GROUP_CARD_CHECKED: 'BOT_GROUP_CARD_CHECKED',
  BOT_GROUP_CARD_UPDATE_ATTEMPTED: 'BOT_GROUP_CARD_UPDATE_ATTEMPTED',
  BOT_GROUP_CARD_UPDATE_SUCCESS: 'BOT_GROUP_CARD_UPDATE_SUCCESS',
  BOT_GROUP_CARD_UPDATE_FAILED: 'BOT_GROUP_CARD_UPDATE_FAILED',

  // 头像同步
  BOT_AVATAR_SYNCED: 'BOT_AVATAR_SYNCED',

  // 通用错误
  BOT_ERROR: 'BOT_ERROR',
} as const;

export type BotAuditAction =
  (typeof BOT_AUDIT_ACTIONS)[keyof typeof BOT_AUDIT_ACTIONS];

// ── Raw Event Logging ───────────────────────────────────

/**
 * 将原始入站事件写入 BotEventLog 表。
 *
 * 此函数永不抛出异常 — 日志写入失败时仅输出 error 级别日志。
 *
 * @param params - 事件参数
 */
export async function logBotEvent(params: {
  /** 事件唯一 ID（用于幂等去重） */
  eventId?: string;
  /** 事件来源平台 */
  platform: string;
  /** 事件类型（如 'group_message'、'group_member_joined'） */
  eventType: string;
  /** 群号 */
  groupId?: string;
  /** 相关 QQ 号 */
  qqNumber?: string;
  /** 提取后的消息文本 */
  messageText?: string;
  /** 原始事件载荷 */
  rawPayload: unknown;
  /** 是否已被处理 */
  handled?: boolean;
  /** 错误消息 */
  errorMessage?: string;
}): Promise<void> {
  try {
    await db.botEventLog.create({
      data: {
        eventId: params.eventId ?? null,
        platform: params.platform,
        eventType: params.eventType,
        groupId: params.groupId ?? null,
        qqNumber: params.qqNumber ?? null,
        messageText: params.messageText ?? null,
        rawPayload: params.rawPayload as Prisma.InputJsonValue,
        handled: params.handled ?? false,
        errorMessage: params.errorMessage ?? null,
      },
    });
  } catch (err) {
    log.error({ err }, 'Failed to write BotEventLog');
  }
}

// ── Outbound Action Logging ─────────────────────────────

/**
 * 将出站 API 调用记录写入 BotActionLog 表。
 *
 * 此函数永不抛出异常 — 日志写入失败时仅输出 error 级别日志。
 *
 * @param params - 动作参数
 */
export async function logBotAction(params: {
  /** 动作名称（如 'send_group_msg'、'set_group_card'） */
  action: string;
  /** 群号 */
  groupId?: string;
  /** 相关 QQ 号 */
  qqNumber?: string;
  /** 执行状态 */
  status: 'success' | 'failed' | 'error';
  /** 请求内容 */
  request?: unknown;
  /** 响应内容 */
  response?: unknown;
  /** 错误消息 */
  errorMessage?: string;
}): Promise<void> {
  try {
    await db.botActionLog.create({
      data: {
        action: params.action,
        groupId: params.groupId ?? null,
        qqNumber: params.qqNumber ?? null,
        status: params.status,
        request: params.request
          ? (params.request as Prisma.InputJsonValue)
          : undefined,
        response: params.response
          ? (params.response as Prisma.InputJsonValue)
          : undefined,
        errorMessage: params.errorMessage ?? null,
      },
    });
  } catch (err) {
    log.error({ err }, 'Failed to write BotActionLog');
  }
}

// ── Audit-Level Logging ─────────────────────────────────

/**
 * 记录机器人审计事件（通过 logAudit 写入 AuditLog 表）。
 *
 * @param params - 审计参数
 */
export async function logBotAudit(params: {
  /** 审计动作（建议使用 BOT_AUDIT_ACTIONS 中的常量） */
  action: string;
  /** 相关 QQ 号 */
  qqNumber?: string;
  /** 群号 */
  groupId?: string;
  /** 附加元数据 */
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await logAudit({
    action: params.action as Parameters<typeof logAudit>[0]['action'],
    targetType: 'Bot',
    metadata: {
      qqNumber: params.qqNumber,
      groupId: params.groupId,
      ...params.metadata,
    } as Prisma.InputJsonValue,
  });
}
