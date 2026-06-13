/**
 * @file napcat.client.ts
 * @description NapCat OneBot v11 HTTP API 客户端实现
 *
 * 通过 HTTP POST 调用 NapCat 暴露的 OneBot v11 接口，支持：
 * - 群消息 / 私聊消息发送（含 CQ 码 @提及）
 * - 群成员信息查询
 * - 陌生人信息查询
 * - 群名片设置
 *
 * 内置 1 次自动重试（仅针对网络错误和 5xx 响应），所有调用均通过
 * pino 记录请求 / 响应日志。
 */

import { createLogger } from '@/lib/logger';
import { BOT_CONFIG } from '../bot.config';
import type { QQBotClient } from './qqbot-client.interface';
import type {
  BotMessage,
  GroupMemberInfo,
  QQUserInfo,
  OneBotResponse,
} from '../bot.types';

const log = createLogger('bot:napcat');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * 根据 QQ 号生成头像 URL
 * @param qqNumber - QQ 号
 * @returns 640px 头像地址
 */
function avatarUrl(qqNumber: string): string {
  return `https://q1.qlogo.cn/g?b=qq&nk=${qqNumber}&s=640`;
}

/**
 * 将 BotMessage 序列化为 OneBot v11 可接受的 CQ 码字符串
 *
 * - text:  直接返回正文
 * - at:    `[CQ:at,qq={qqNumber}] {content}`
 * - mixed: `[CQ:at,qq={qqNumber}] {content}`（与 at 相同格式）
 */
function serializeMessage(message: BotMessage): string {
  if (message.type === 'text') {
    return message.content;
  }
  // type === 'at' || type === 'mixed'
  const atCode = `[CQ:at,qq=${message.atQQNumber}]`;
  return message.content ? `${atCode} ${message.content}` : atCode;
}

/**
 * 判断一个错误或 HTTP 状态码是否属于可重试的瞬态故障
 */
function isTransientError(error: unknown, status?: number): boolean {
  // 网络层错误（DNS、TCP reset 等）
  if (error instanceof TypeError) return true;
  // 5xx 服务端错误
  if (status !== undefined && status >= 500) return true;
  return false;
}

// ---------------------------------------------------------------------------
// NapCatClient
// ---------------------------------------------------------------------------

/**
 * NapCat OneBot v11 HTTP API 客户端
 *
 * @example
 * ```ts
 * import { napcatClient } from '@/server/bot/clients/napcat.client';
 *
 * await napcatClient.sendGroupMessage('123456789', {
 *   type: 'at',
 *   atQQNumber: '987654321',
 *   content: '欢迎入群！',
 * });
 * ```
 */
class NapCatClient implements QQBotClient {
  private readonly baseUrl: string;
  private readonly accessToken: string;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly timeoutMs: number;

  constructor() {
    this.baseUrl = BOT_CONFIG.napcat.httpBaseUrl.replace(/\/+$/, '');
    this.accessToken = BOT_CONFIG.napcat.accessToken;
    // BOT_CONFIG doesn't expose these directly — use sensible defaults
    this.maxRetries = 1;
    this.retryDelayMs = 1_000;
    this.timeoutMs = 10_000;

    if (!this.accessToken) {
      log.warn('NAPCAT_ACCESS_TOKEN is not set — API calls will likely fail');
    }
    log.info({ baseUrl: this.baseUrl }, 'NapCatClient initialized');
  }

  // -----------------------------------------------------------------------
  // QQBotClient implementation
  // -----------------------------------------------------------------------

  /** @inheritdoc */
  async getGroupMemberInfo(
    groupId: string,
    qqNumber: string,
  ): Promise<GroupMemberInfo> {
    const resp = await this.callApi<{
      group_id: number;
      user_id: number;
      nickname: string;
      card: string;
      role: 'owner' | 'admin' | 'member';
      title: string;
      join_time: number;
      last_sent_time: number;
    }>('get_group_member_info', {
      group_id: Number(groupId),
      user_id: Number(qqNumber),
    });

    return {
      groupId: String(resp.data.group_id),
      qqNumber: String(resp.data.user_id),
      nickname: resp.data.nickname,
      card: resp.data.card || '',
      avatarUrl: avatarUrl(String(resp.data.user_id)),
      role: resp.data.role,
      joinTime: resp.data.join_time,
      lastSentTime: resp.data.last_sent_time,
    };
  }

  /** @inheritdoc */
  async getStrangerInfo(qqNumber: string): Promise<QQUserInfo> {
    const resp = await this.callApi<{
      user_id: number;
      nickname: string;
      sex: string;
      age: number;
    }>('get_stranger_info', {
      user_id: Number(qqNumber),
    });

    return {
      qqNumber: String(resp.data.user_id),
      nickname: resp.data.nickname,
      avatarUrl: avatarUrl(String(resp.data.user_id)),
      sex: resp.data.sex,
      age: resp.data.age,
    };
  }

  /** @inheritdoc */
  async setGroupCard(
    groupId: string,
    qqNumber: string,
    card: string,
  ): Promise<void> {
    await this.callApi('set_group_card', {
      group_id: Number(groupId),
      user_id: Number(qqNumber),
      card,
    });
  }

  /** @inheritdoc */
  async sendGroupMessage(
    groupId: string,
    message: BotMessage,
  ): Promise<void> {
    await this.callApi('send_group_msg', {
      group_id: Number(groupId),
      message: serializeMessage(message),
    });
  }

  /** @inheritdoc */
  async sendPrivateMessage(
    qqNumber: string,
    message: BotMessage,
  ): Promise<void> {
    await this.callApi('send_private_msg', {
      user_id: Number(qqNumber),
      message: serializeMessage(message),
    });
  }

  // -----------------------------------------------------------------------
  // Internal: HTTP call with retry
  // -----------------------------------------------------------------------

  /**
   * 调用 OneBot v11 HTTP API
   *
   * - POST `{baseUrl}/{action}`
   * - 自动添加 Authorization: Bearer 头
   * - 遇到瞬态故障（网络错误 / 5xx）自动重试 {@link maxRetries} 次
   * - 非 `ok` 状态视为业务错误，直接抛出
   *
   * @param action - OneBot v11 动作名称，如 `send_group_msg`
   * @param params - 动作参数对象
   * @returns 解析后的 OneBot 响应（含 data 字段）
   * @throws 超过重试次数或遇到不可恢复错误时抛出
   */
  private async callApi<T = unknown>(
    action: string,
    params: Record<string, unknown>,
  ): Promise<OneBotResponse<T>> {
    const url = `${this.baseUrl}/${action}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const isRetry = attempt > 0;
      if (isRetry) {
        log.warn(
          { action, attempt, maxRetries: this.maxRetries },
          'Retrying NapCat API call',
        );
        await this.sleep(this.retryDelayMs);
      }

      try {
        log.debug({ action, params, attempt }, 'Calling NapCat API');

        const controller = new AbortController();
        const timer = setTimeout(
          () => controller.abort(),
          this.timeoutMs,
        );

        let response: Response;
        try {
          response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(params),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timer);
        }

        // On 5xx — retry if we can
        if (response.status >= 500) {
          lastError = new Error(
            `NapCat API ${action} returned HTTP ${response.status}`,
          );
          if (isTransientError(lastError, response.status)) {
            log.warn(
              { action, status: response.status },
              'NapCat returned 5xx, will retry',
            );
            continue;
          }
        }

        // Parse JSON body
        const body = (await response.json()) as OneBotResponse<T>;

        log.debug(
          { action, status: body.status, retcode: body.retcode },
          'NapCat API response',
        );

        // OneBot-level error
        if (body.status !== 'ok') {
          const msg =
            body.message || body.wording || `retcode=${body.retcode}`;
          log.error(
            { action, retcode: body.retcode, msg },
            'NapCat API returned non-ok status',
          );
          throw new Error(
            `NapCat API ${action} failed: ${msg} (retcode=${body.retcode})`,
          );
        }

        return body;
      } catch (error) {
        lastError = error;

        // AbortError = timeout
        if (
          error instanceof DOMException &&
          error.name === 'AbortError'
        ) {
          log.warn({ action, timeoutMs: this.timeoutMs }, 'NapCat API call timed out');
          continue;
        }

        // Network-level errors (TypeError from fetch) are retryable
        if (isTransientError(error)) {
          log.warn(
            { action, err: (error as Error).message },
            'Transient error calling NapCat API',
          );
          continue;
        }

        // Non-retryable error — break immediately
        throw error;
      }
    }

    // All retries exhausted
    log.error(
      { action, attempts: this.maxRetries + 1 },
      'NapCat API call failed after all retries',
    );
    throw lastError instanceof Error
      ? lastError
      : new Error(`NapCat API ${action} failed after ${this.maxRetries + 1} attempts`);
  }

  /**
   * 延迟指定毫秒
   * @param ms - 毫秒数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

/** NapCat 客户端单例，供全模块使用 */
export const napcatClient: QQBotClient = new NapCatClient();
