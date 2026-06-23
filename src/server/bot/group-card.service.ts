/**
 * @file group-card.service.ts
 * @description 群名片校验与同步服务
 *
 * 群名片格式：`年龄｜省份｜昵称`（如 `20｜云南｜Harry`）
 * 分隔符为全角竖线 `｜`（U+FF5C），可通过 BOT_CONFIG.groupCard.separator 配置。
 *
 * 校验规则：
 * 1. 格式必须为 X｜Y｜Z（3 段，由分隔符分割）
 * 2. 年龄为合法整数，>= minAge（默认 18），<= maxAge（默认 100）
 * 3. 省份须在 PROVINCES 派生的短名列表中
 * 4. 昵称不得为空，且不得包含手机号、微信号、QQ 号等敏感信息
 *
 * @module server/bot/group-card.service
 */

import type { GroupCardCheckResult, ParsedGroupCard } from './bot.types';
import { BOT_CONFIG } from './bot.config';
import { PROVINCES } from '@/data/regions';
import { createLogger } from '@/lib/logger';
import {
  formatGroupCard,
  normalizeGroupCardProvince,
  parseGroupCard as parseFlexibleGroupCard,
} from '@/lib/group-card';

const log = createLogger('bot:group-card');

// ── Province Short-Name Derivation ──────────────────────

/**
 * 从 PROVINCES 列表中剥离行政后缀，得到群名片使用的省份短名。
 *
 * 例如：
 *   '云南省'       → '云南'
 *   '北京市'       → '北京'
 *   '广西壮族自治区' → '广西'
 *   '香港特别行政区' → '香港'
 *   '🌏 海外'      → '海外'
 */
export const VALID_PROVINCES: string[] = PROVINCES.map((p) => {
  return normalizeGroupCardProvince(p.name);
}).filter((n) => n.length > 0);

// ── Sensitive Pattern Detection ─────────────────────────

/**
 * 昵称中不允许出现的敏感模式：
 * - 手机号码（11 位连续数字，1 开头）
 * - 微信号标识（wx: / wechat: 前缀，大小写不敏感）
 * - QQ 号标识（qq: 前缀，大小写不敏感）
 */
const SENSITIVE_PATTERNS: RegExp[] = [
  /1[3-9]\d{9}/,               // 中国手机号
  /wx:/i,                      // 微信号前缀 wx:
  /wechat:/i,                  // 微信号前缀 wechat:
  /qq:\s*\d{5,}/i,             // QQ 号（qq: 后跟 5 位以上数字）
];

/**
 * 检测字符串是否包含敏感模式
 * @param text - 待检测文本
 * @returns 是否匹配到任一敏感模式
 */
function containsSensitivePattern(text: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(text));
}

// ── Public API ──────────────────────────────────────────

/**
 * 解析群名片字符串为结构化对象。
 *
 * @param card - 原始群名片字符串，如 `20｜云南｜Harry`
 * @returns 解析结果；格式不正确时返回 `null`
 *
 * @example
 * ```ts
 * parseGroupCard('25｜北京｜小明');
 * // => { age: 25, province: '北京', nickname: '小明' }
 *
 * parseGroupCard('invalid');
 * // => null
 * ```
 */
export function parseGroupCard(card: string): ParsedGroupCard | null {
  return parseFlexibleGroupCard(card);
}

/**
 * 校验群名片格式及内容合规性。
 *
 * @param card - 原始群名片字符串
 * @returns `{ result, parsed }` — result 为检查结果，parsed 仅在 result 为 'valid' 时可用
 *
 * @example
 * ```ts
 * const { result, parsed } = validateGroupCard('22｜云南｜Harry');
 * if (result === 'valid') {
 *   console.log(parsed); // { age: 22, province: '云南', nickname: 'Harry' }
 * }
 * ```
 */
export function validateGroupCard(
  card: string,
): { result: GroupCardCheckResult; parsed?: ParsedGroupCard } {
  const parsed = parseGroupCard(card);

  // 1. 格式校验：必须是 3 段
  if (!parsed) {
    log.debug({ card }, 'Group card format invalid');
    return { result: 'invalid_format' };
  }

  const { minAge, maxAge } = BOT_CONFIG.groupCard;

  // 2. 年龄校验
  if (parsed.age < minAge || parsed.age > maxAge) {
    log.debug({ card, age: parsed.age, minAge, maxAge }, 'Group card age out of range');
    return { result: 'invalid_age', parsed };
  }

  // 3. 省份校验：短名必须在合法列表内
  if (!VALID_PROVINCES.includes(parsed.province)) {
    log.debug({ card, province: parsed.province }, 'Group card province invalid');
    return { result: 'invalid_province', parsed };
  }

  // 4. 昵称校验：非空 + 不含敏感信息
  if (!parsed.nickname || parsed.nickname.length === 0) {
    log.debug({ card }, 'Group card nickname empty');
    return { result: 'invalid_nickname', parsed };
  }

  if (containsSensitivePattern(parsed.nickname)) {
    log.debug({ card }, 'Group card nickname contains sensitive pattern');
    return { result: 'invalid_nickname', parsed };
  }

  return { result: 'valid', parsed };
}

/**
 * 根据用户信息生成标准格式群名片。
 *
 * @param age      - 用户年龄
 * @param province - 省份短名（如 '云南'）
 * @param nickname - 用户昵称
 * @returns 拼接后的群名片字符串
 *
 * @example
 * ```ts
 * generateGroupCard(22, '云南', 'Harry');
 * // => '22｜云南｜Harry'
 * ```
 */
export function generateGroupCard(
  age: number,
  province: string,
  nickname: string,
): string {
  const { separator } = BOT_CONFIG.groupCard;
  return formatGroupCard(age, province, nickname, separator);
}
