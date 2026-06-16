/**
 * @file bot-event-normalizer.ts
 * @description 将 OneBot v11 原始事件转换为标准化的内部事件格式
 *
 * 该模块是事件处理管线的第一站：
 * 1. 接收来自 NapCat Webhook 的原始 JSON 负载
 * 2. 按 post_type / notice_type 分类
 * 3. 输出统一的 BotGroupMessageEvent / BotGroupMember*Event
 * 4. 为每个事件生成确定性 ID，支持幂等去重
 *
 * 不关心的事件类型统一返回 `{ type: 'ignored', reason }` 并记录日志。
 */

import type {
  OneBotRawEvent,
  OneBotGroupMessageEvent,
  OneBotGroupNoticeEvent,
  BotGroupMessageEvent,
  BotGroupMemberJoinedEvent,
  BotGroupMemberLeftEvent,
} from './bot.types';
import type { GroupCardChangedEvent } from './group-card-changed.handler';
import { createLogger } from '@/lib/logger';
import crypto from 'crypto';

const log = createLogger('bot:normalizer');

/** 标准化事件的联合类型 */
export type NormalizedEvent =
  | { type: 'group_message'; event: BotGroupMessageEvent }
  | { type: 'group_member_joined'; event: BotGroupMemberJoinedEvent }
  | { type: 'group_member_left'; event: BotGroupMemberLeftEvent }
  | { type: 'group_card_changed'; event: GroupCardChangedEvent }
  | { type: 'ignored'; reason: string };

/**
 * 将 OneBot v11 原始事件标准化为内部事件格式
 *
 * @param raw - OneBot v11 原始事件对象
 * @returns 标准化后的事件，或 `{ type: 'ignored' }` 表示无需处理
 *
 * @example
 * ```ts
 * const result = normalizeEvent(rawPayload);
 * if (result.type === 'group_message') {
 *   await handleGroupMessage(result.event);
 * }
 * ```
 */
export function normalizeEvent(raw: OneBotRawEvent): NormalizedEvent {
  const eventId = generateEventId(raw);

  switch (raw.post_type) {
    case 'message': {
      const msg = raw as OneBotGroupMessageEvent;
      if (msg.message_type !== 'group') {
        return { type: 'ignored', reason: `Non-group message type: ${msg.message_type}` };
      }

      // 优先使用 raw_message（CQ 码字符串），其次使用 message 字段
      let messageText = '';
      if (typeof msg.raw_message === 'string') {
        messageText = msg.raw_message.trim();
      } else if (typeof msg.message === 'string') {
        messageText = msg.message.trim();
      }

      log.debug(
        { eventId, groupId: msg.group_id, userId: msg.user_id },
        'Normalized group message event',
      );

      return {
        type: 'group_message',
        event: {
          eventId,
          platform: 'napcat',
          groupId: String(msg.group_id),
          qqNumber: String(msg.user_id),
          messageText,
          rawMessage: raw,
          timestamp: msg.time,
        },
      };
    }

    case 'notice': {
      const notice = raw as OneBotGroupNoticeEvent;

      if (notice.notice_type === 'group_increase') {
        log.debug(
          { eventId, groupId: notice.group_id, userId: notice.user_id },
          'Normalized group member joined event',
        );

        return {
          type: 'group_member_joined',
          event: {
            eventId,
            platform: 'napcat',
            groupId: String(notice.group_id),
            qqNumber: String(notice.user_id),
            operatorId: notice.operator_id ? String(notice.operator_id) : undefined,
            timestamp: notice.time,
            rawEvent: raw,
          },
        };
      }

      if (notice.notice_type === 'group_decrease') {
        let leaveType: 'leave' | 'kick' | 'unknown' = 'unknown';
        if (notice.sub_type === 'leave') leaveType = 'leave';
        else if (notice.sub_type === 'kick' || notice.sub_type === 'kick_me') leaveType = 'kick';

        log.debug(
          { eventId, groupId: notice.group_id, userId: notice.user_id, leaveType },
          'Normalized group member left event',
        );

        return {
          type: 'group_member_left',
          event: {
            eventId,
            platform: 'napcat',
            groupId: String(notice.group_id),
            qqNumber: String(notice.user_id),
            operatorId: notice.operator_id ? String(notice.operator_id) : undefined,
            leaveType,
            timestamp: notice.time,
            rawEvent: raw,
          },
        };
      }

      if (notice.notice_type === 'group_card') {
        const cardNew = (notice as Record<string, unknown>).card_new as string || '';
        const cardOld = (notice as Record<string, unknown>).card_old as string || '';

        log.debug(
          { eventId, groupId: notice.group_id, userId: notice.user_id, cardOld, cardNew },
          'Normalized group card changed event',
        );

        return {
          type: 'group_card_changed',
          event: {
            groupId: String(notice.group_id),
            qqNumber: String(notice.user_id),
            cardNew,
            cardOld,
          },
        };
      }

      log.debug({ noticeType: notice.notice_type }, 'Ignored notice event');
      return { type: 'ignored', reason: `Unhandled notice type: ${notice.notice_type}` };
    }

    case 'meta_event':
      return { type: 'ignored', reason: 'Meta event' };

    default:
      log.warn({ postType: raw.post_type }, 'Unknown post_type in raw event');
      return { type: 'ignored', reason: `Unknown post_type: ${raw.post_type}` };
  }
}

/**
 * 为原始事件生成确定性的唯一 ID
 *
 * - 如果事件包含 `message_id`，直接使用 `ob11_msg_{message_id}`
 * - 否则根据 `time + post_type + self_id` 计算 SHA-256 哈希的前 16 位
 *
 * @param raw - OneBot v11 原始事件
 * @returns 确定性事件 ID 字符串
 */
function generateEventId(raw: OneBotRawEvent): string {
  const msgId = (raw as Record<string, unknown>).message_id;
  if (msgId) return `ob11_msg_${msgId}`;

  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify({ t: raw.time, pt: raw.post_type, sid: raw.self_id }))
    .digest('hex')
    .slice(0, 16);
  return `ob11_evt_${hash}`;
}
