/**
 * @file bot-command-result.ts
 * @description 命令结果码 → 用户可见中文回复消息的映射
 *
 * 所有面向用户的文案集中管理于此文件，便于维护和国际化。
 * 消息模板不得包含任何敏感信息（如内部错误详情、数据库 ID 等）。
 */

import type { BotCommandResult, BotCommandResultCode } from './bot.types';

/**
 * 结果码与回复消息的映射表
 *
 * 每个条目是一个函数，接收可选的 `email` 参数用于模板填充，
 * 返回发送给用户的中文消息文本。
 */
const REPLY_MESSAGES: Record<BotCommandResultCode, (email?: string) => string> = {
  REGISTER_CODE_SENT: (email) =>
    `注册申请已受理，验证码已发送至你的 QQ 邮箱：${email}。\n请在 10 分钟内前往邮箱查看，并在 Web 注册页面完成注册。`,

  ALREADY_REGISTERED: () =>
    `你已经完成注册，无需重复申请验证码。\n如无法登录，请使用 /reset password。`,

  EMAIL_CODE_STILL_VALID: () =>
    `你的验证码仍在有效期内，请前往 QQ 邮箱查看。\n如长时间未收到，请稍后重试或联系管理员。`,

  RESET_PASSWORD_EMAIL_SENT: (email) =>
    `密码重置验证码已发送至你的 QQ 邮箱：${email}。\n请在有效期内打开邮件完成密码重置。`,

  RESET_PASSWORD_EMAIL_STILL_VALID: () =>
    `你的密码重置验证码仍在有效期内，请前往 QQ 邮箱查看。\n如长时间未收到，请稍后重试或联系管理员。`,

  ACCOUNT_NOT_FOUND: () =>
    `系统未找到与你 QQ 号绑定的账号。\n如需使用系统，请先发送 /signup 完成注册。`,

  ACCOUNT_BANNED: () =>
    `你的账号当前无法使用该功能，请联系管理员处理。`,

  ACCOUNT_DELETED: () =>
    `你的账号当前无法使用该功能，请联系管理员处理。`,

  RATE_LIMITED: () =>
    `操作过于频繁，请稍后重试。`,

  INVALID_GROUP: () =>
    `该指令仅在指定 QQ 群内有效。`,

  GROUP_CARD_INVALID: () =>
    `你的群名片格式不符合要求，请修改后重试。`,

  SYSTEM_ERROR: () =>
    `系统暂时无法处理你的请求，请稍后重试。\n如果多次失败，请联系管理员。`,
};

/**
 * 根据命令执行结果获取用户可见的回复消息
 *
 * @param result - 命令执行结果对象
 * @returns 格式化后的中文回复文本
 *
 * @example
 * ```ts
 * const result: BotCommandResult = {
 *   success: true,
 *   code: 'REGISTER_CODE_SENT',
 *   message: 'Verification code sent',
 *   qqNumber: '123456',
 *   email: '123456@qq.com',
 *   shouldMentionUser: true,
 * };
 * const reply = getReplyMessage(result);
 * // => "注册申请已受理，验证码已发送至你的 QQ 邮箱：123456@qq.com。..."
 * ```
 */
export function getReplyMessage(result: BotCommandResult): string {
  const formatter = REPLY_MESSAGES[result.code];
  return formatter(result.email);
}
