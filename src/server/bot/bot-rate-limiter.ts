/**
 * @file bot-rate-limiter.ts
 * @description 机器人命令频率限制器
 *
 * 基于 Redis 的滑动窗口限流，防止单个 QQ 号恶意调用注册或密码重置命令。
 *
 * 限流策略：
 * - **间隔锁**：两次调用之间必须等待指定分钟数（SETEX 键）
 * - **小时计数器**：每小时调用上限（仅注册命令）
 * - **天计数器**：每天调用上限
 *
 * Redis Key 格式：
 * ```
 * bot:rate:{command}:{qqNumber}:interval  — 间隔锁
 * bot:rate:{command}:{qqNumber}:hour      — 小时计数
 * bot:rate:{command}:{qqNumber}:day       — 天计数
 * ```
 *
 * @module server/bot/bot-rate-limiter
 */

import { redis } from '@/lib/redis';
import { BOT_CONFIG } from './bot.config';
import { createLogger } from '@/lib/logger';

const log = createLogger('bot:rate-limiter');

/** 限流检查结果 */
export type RateLimitResult = {
  /** 是否允许本次请求 */
  allowed: boolean;
  /** 被限流时的建议重试秒数 */
  retryAfterSeconds?: number;
};

/**
 * 检查指定 QQ 号在给定命令上是否受到限流。
 *
 * 依次检查三个窗口（任一不通过即拒绝）：
 * 1. 间隔锁 — 短期内不得重复调用
 * 2. 小时计数（仅 register）— 每小时上限
 * 3. 天计数 — 每天上限
 *
 * @param qqNumber - QQ 号
 * @param command  - 命令类型
 * @returns 限流检查结果
 *
 * @example
 * ```ts
 * const { allowed, retryAfterSeconds } = await checkBotRateLimit('123456', 'register');
 * if (!allowed) {
 *   reply(`操作太频繁，请 ${retryAfterSeconds} 秒后再试`);
 * }
 * ```
 */
export async function checkBotRateLimit(
  qqNumber: string,
  command: 'register' | 'password_reset',
): Promise<RateLimitResult> {
  const config =
    command === 'register'
      ? BOT_CONFIG.rateLimits.register
      : BOT_CONFIG.rateLimits.passwordReset;

  const prefix = `bot:rate:${command}:${qqNumber}`;

  // ── 1. 间隔锁（最短窗口） ──────────────────────────
  const intervalKey = `${prefix}:interval`;
  const intervalMinutes = config.intervalMinutes;

  const intervalExists = await redis.exists(intervalKey);
  if (intervalExists) {
    const ttl = await redis.ttl(intervalKey);
    log.debug({ qqNumber, command, ttl }, 'Rate limited by interval lock');
    return {
      allowed: false,
      retryAfterSeconds: ttl > 0 ? ttl : intervalMinutes * 60,
    };
  }

  // ── 2. 小时计数（仅注册命令） ──────────────────────
  if (command === 'register') {
    const hourKey = `${prefix}:hour`;
    const hourCount = await redis.get(hourKey);
    const registerConfig = BOT_CONFIG.rateLimits.register;

    if (hourCount && parseInt(hourCount, 10) >= registerConfig.maxPerHour) {
      log.debug({ qqNumber, command, hourCount }, 'Rate limited by hourly cap');
      return { allowed: false, retryAfterSeconds: 3600 };
    }
  }

  // ── 3. 天计数 ─────────────────────────────────────
  const dayKey = `${prefix}:day`;
  const dayCount = await redis.get(dayKey);
  const maxPerDay =
    command === 'register'
      ? BOT_CONFIG.rateLimits.register.maxPerDay
      : config.maxPerDay;

  if (dayCount && parseInt(dayCount, 10) >= maxPerDay) {
    log.debug({ qqNumber, command, dayCount }, 'Rate limited by daily cap');
    return { allowed: false, retryAfterSeconds: 86400 };
  }

  return { allowed: true };
}

/**
 * 在命令成功处理后记录一次调用，更新所有限流计数器。
 *
 * 使用 Redis pipeline 将三组操作合并为一次 round-trip：
 * 1. 设置间隔锁（SETEX，自动过期）
 * 2. 递增小时计数器（仅 register）
 * 3. 递增天计数器
 *
 * @param qqNumber - QQ 号
 * @param command  - 命令类型
 *
 * @example
 * ```ts
 * // 命令处理成功后调用
 * await recordBotCommandUsage('123456', 'register');
 * ```
 */
export async function recordBotCommandUsage(
  qqNumber: string,
  command: 'register' | 'password_reset',
): Promise<void> {
  const config =
    command === 'register'
      ? BOT_CONFIG.rateLimits.register
      : BOT_CONFIG.rateLimits.passwordReset;

  const prefix = `bot:rate:${command}:${qqNumber}`;
  const intervalMinutes = config.intervalMinutes;

  const pipeline = redis.pipeline();

  // 间隔锁
  pipeline.setex(`${prefix}:interval`, intervalMinutes * 60, '1');

  // 小时计数（仅注册命令）
  if (command === 'register') {
    const hourKey = `${prefix}:hour`;
    pipeline.incr(hourKey);
    pipeline.expire(hourKey, 3600);
  }

  // 天计数
  const dayKey = `${prefix}:day`;
  pipeline.incr(dayKey);
  pipeline.expire(dayKey, 86400);

  await pipeline.exec();
  log.debug({ qqNumber, command }, 'Rate limit usage recorded');
}
