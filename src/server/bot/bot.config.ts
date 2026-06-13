/**
 * @file bot.config.ts
 * @description 机器人模块集中配置
 *
 * 所有与机器人相关的环境变量在此统一读取，并提供类型安全的配置对象。
 * 模块导入时会自动校验必填配置并输出日志。
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('bot:config');

/**
 * 机器人全局配置
 *
 * 通过环境变量注入，支持以下分组：
 * - 基础配置（provider、目标群、鉴权 Token）
 * - NapCat HTTP API 连接参数
 * - 频率限制策略
 * - 群名片规则
 * - 邮箱与验证码
 * - 命令关键字
 */
export const BOT_CONFIG = {
  /** 机器人提供方：napcat / onebot / other */
  provider: process.env.BOT_PROVIDER || 'napcat',
  /** 目标群号（仅处理该群的事件） */
  targetGroupId: process.env.BOT_TARGET_GROUP_ID || '',
  /** Webhook 鉴权 Token（NapCat 上报时携带） */
  webhookToken: process.env.BOT_WEBHOOK_TOKEN || '',
  /** 内部服务调用密钥 */
  internalSecret: process.env.BOT_INTERNAL_SECRET || '',

  /** NapCat HTTP API 连接配置 */
  napcat: {
    /** NapCat HTTP API 基础地址 */
    httpBaseUrl: process.env.NAPCAT_HTTP_BASE_URL || 'http://127.0.0.1:3001',
    /** NapCat API 访问令牌 */
    accessToken: process.env.NAPCAT_ACCESS_TOKEN || '',
  },

  /** 频率限制策略 */
  rateLimits: {
    /** 注册命令限流 */
    register: {
      /** 两次注册之间的最小间隔（分钟） */
      intervalMinutes: parseInt(process.env.BOT_REGISTER_RATE_LIMIT_MINUTES || '5', 10),
      /** 每小时最多注册次数 */
      maxPerHour: parseInt(process.env.BOT_REGISTER_MAX_PER_HOUR || '3', 10),
      /** 每天最多注册次数 */
      maxPerDay: parseInt(process.env.BOT_REGISTER_MAX_PER_DAY || '5', 10),
    },
    /** 密码重置命令限流 */
    passwordReset: {
      /** 两次重置之间的最小间隔（分钟） */
      intervalMinutes: parseInt(process.env.BOT_PASSWORD_RESET_RATE_LIMIT_MINUTES || '10', 10),
      /** 每天最多重置次数 */
      maxPerDay: parseInt(process.env.BOT_PASSWORD_RESET_MAX_PER_DAY || '5', 10),
    },
  },

  /** 群名片格式规则 */
  groupCard: {
    /** 群名片字段分隔符（全角竖线） */
    separator: process.env.GROUP_CARD_SEPARATOR || '｜',
    /** 是否自动修复不合规群名片 */
    autoFix: process.env.GROUP_CARD_AUTO_FIX !== 'false',
    /** 允许的最小年龄 */
    minAge: parseInt(process.env.GROUP_CARD_MIN_AGE || '18', 10),
    /** 允许的最大年龄 */
    maxAge: parseInt(process.env.GROUP_CARD_MAX_AGE || '100', 10),
  },

  /** 邮箱与验证码配置 */
  email: {
    /** 验证码有效期（分钟） */
    codeExpireMinutes: parseInt(process.env.EMAIL_CODE_EXPIRE_MINUTES || '15', 10),
    /** QQ 邮箱后缀域名 */
    qqDomain: process.env.QQ_EMAIL_DOMAIN || 'qq.com',
  },

  /** 命令关键字 */
  commands: {
    /** 注册命令 */
    register: process.env.REGISTER_COMMAND || '/signup',
    /** 密码重置命令 */
    passwordReset: process.env.PASSWORD_RESET_COMMAND || '/reset password',
  },
} as const;

/**
 * 判断给定群号是否为目标群
 * @param groupId - 待检查的群号
 * @returns 是否匹配目标群
 */
export function isTargetGroup(groupId: string): boolean {
  return groupId === BOT_CONFIG.targetGroupId;
}

/**
 * 根据 QQ 号生成对应的 QQ 邮箱地址
 * @param qqNumber - QQ 号
 * @returns QQ 邮箱地址，如 `123456@qq.com`
 */
export function getQQEmail(qqNumber: string): string {
  return `${qqNumber}@${BOT_CONFIG.email.qqDomain}`;
}

// ---------------------------------------------------------------------------
// Startup validation
// ---------------------------------------------------------------------------

if (BOT_CONFIG.targetGroupId) {
  log.info(
    { targetGroupId: BOT_CONFIG.targetGroupId, provider: BOT_CONFIG.provider },
    'Bot config loaded',
  );
} else {
  log.warn('BOT_TARGET_GROUP_ID not set — bot module disabled');
}
