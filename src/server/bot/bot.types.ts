/**
 * @file bot.types.ts
 * @description 机器人模块的所有 TypeScript 类型定义
 *
 * 包含：
 * - 发送消息类型（BotMessage）
 * - 标准化事件类型（群消息、成员加入/退出）
 * - 群成员信息与 QQ 用户信息
 * - 命令执行结果
 * - 群名片解析与同步状态
 * - OneBot v11 原始事件类型（来自 NapCat）
 */

// ---------------------------------------------------------------------------
// Bot Message Types
// ---------------------------------------------------------------------------

/** 机器人发送的消息结构 */
export interface BotMessage {
  /** 消息类型：纯文本 / @某人 / 混合消息 */
  type: 'text' | 'at' | 'mixed';
  /** 消息正文内容 */
  content: string;
  /** 当 type 为 'at' 或 'mixed' 时，需要 @ 的 QQ 号 */
  atQQNumber?: string;
}

// ---------------------------------------------------------------------------
// Standardized Bot Events
// ---------------------------------------------------------------------------

/** 标准化的群消息事件 */
export interface BotGroupMessageEvent {
  /** 唯一事件 ID，用于幂等去重 */
  eventId: string;
  /** 事件来源平台 */
  platform: 'napcat' | 'onebot' | 'other';
  /** 群号 */
  groupId: string;
  /** 发送者 QQ 号 */
  qqNumber: string;
  /** 提取后的纯文本消息内容 */
  messageText: string;
  /** 原始消息体（用于调试） */
  rawMessage: unknown;
  /** 事件时间戳（Unix 秒） */
  timestamp: number;
}

/** 标准化的群成员加入事件 */
export interface BotGroupMemberJoinedEvent {
  /** 唯一事件 ID */
  eventId: string;
  /** 事件来源平台 */
  platform: 'napcat' | 'onebot' | 'other';
  /** 群号 */
  groupId: string;
  /** 加入者 QQ 号 */
  qqNumber: string;
  /** 操作者 QQ 号（邀请人或审批管理员） */
  operatorId?: string;
  /** 事件时间戳（Unix 秒） */
  timestamp: number;
  /** 原始事件体（用于调试） */
  rawEvent: unknown;
}

/** 标准化的群成员退出事件 */
export interface BotGroupMemberLeftEvent {
  /** 唯一事件 ID */
  eventId: string;
  /** 事件来源平台 */
  platform: 'napcat' | 'onebot' | 'other';
  /** 群号 */
  groupId: string;
  /** 退出者 QQ 号 */
  qqNumber: string;
  /** 操作者 QQ 号（踢人时为管理员） */
  operatorId?: string;
  /** 退出方式：主动退群 / 被踢 / 未知 */
  leaveType: 'leave' | 'kick' | 'unknown';
  /** 事件时间戳（Unix 秒） */
  timestamp: number;
  /** 原始事件体（用于调试） */
  rawEvent: unknown;
}

// ---------------------------------------------------------------------------
// Group Member & QQ User Info
// ---------------------------------------------------------------------------

/** 群成员信息（从 OneBot API 获取） */
export interface GroupMemberInfo {
  /** 群号 */
  groupId: string;
  /** 成员 QQ 号 */
  qqNumber: string;
  /** QQ 昵称 */
  nickname: string;
  /** 群名片（群备注） */
  card: string;
  /** 头像 URL */
  avatarUrl?: string;
  /** 群内角色 */
  role?: 'owner' | 'admin' | 'member';
  /** 入群时间（Unix 秒） */
  joinTime?: number;
  /** 最后发言时间（Unix 秒） */
  lastSentTime?: number;
}

/** QQ 用户基本信息 */
export interface QQUserInfo {
  /** QQ 号 */
  qqNumber: string;
  /** QQ 昵称 */
  nickname: string;
  /** 头像 URL */
  avatarUrl?: string;
  /** 性别 */
  sex?: string;
  /** 年龄 */
  age?: number;
}

// ---------------------------------------------------------------------------
// Command Result Types
// ---------------------------------------------------------------------------

/**
 * 机器人命令执行结果码
 *
 * 每个结果码对应一条用户可见的中文提示（见 bot-command-result.ts）
 */
export type BotCommandResultCode =
  | 'REGISTER_CODE_SENT'
  | 'ALREADY_REGISTERED'
  | 'EMAIL_CODE_STILL_VALID'
  | 'RESET_PASSWORD_EMAIL_SENT'
  | 'RESET_PASSWORD_EMAIL_STILL_VALID'
  | 'ACCOUNT_NOT_FOUND'
  | 'ACCOUNT_BANNED'
  | 'ACCOUNT_DELETED'
  | 'RATE_LIMITED'
  | 'INVALID_GROUP'
  | 'GROUP_CARD_INVALID'
  | 'SYSTEM_ERROR';

/** 机器人命令执行结果 */
export interface BotCommandResult {
  /** 命令是否成功执行 */
  success: boolean;
  /** 结果码，用于映射回复消息 */
  code: BotCommandResultCode;
  /** 内部日志消息（不直接展示给用户） */
  message: string;
  /** 执行命令的用户 QQ 号 */
  qqNumber: string;
  /** 相关邮箱地址（用于消息模板填充） */
  email?: string;
  /** 是否需要在回复中 @该用户 */
  shouldMentionUser: boolean;
}

// ---------------------------------------------------------------------------
// Group Card Types
// ---------------------------------------------------------------------------

/**
 * 群名片校验结果
 *
 * - valid: 格式正确
 * - invalid_format: 整体格式不匹配（缺少分隔符等）
 * - invalid_age: 年龄不是有效数字
 * - underage: 年龄低于最低限制
 * - invalid_province: 省份不在合法列表中
 * - invalid_nickname: 昵称为空或含非法字符
 * - contains_sensitive_words: 昵称包含敏感词
 */
export type GroupCardCheckResult =
  | 'valid'
  | 'invalid_format'
  | 'invalid_age'
  | 'underage'
  | 'invalid_province'
  | 'invalid_nickname'
  | 'contains_sensitive_words';

/**
 * 群名片同步状态
 *
 * - synced: 数据库与群名片一致
 * - pending_sync: 等待同步
 * - sync_failed: 同步失败
 * - user_modified_invalid: 用户自行修改导致无效
 * - auto_fixed: 系统自动修复
 */
export type GroupCardSyncStatus =
  | 'synced'
  | 'pending_sync'
  | 'sync_failed'
  | 'user_modified_invalid'
  | 'auto_fixed';

/**
 * 群成员状态
 *
 * - active: 正常在群
 * - left_pending_review: 已退群，待审核
 * - left_confirmed: 退群已确认
 * - restored: 重新入群（已恢复）
 * - removed: 已被移除
 */
export type GroupMembershipStatus =
  | 'active'
  | 'left_pending_review'
  | 'left_confirmed'
  | 'restored'
  | 'removed';

/** 退群方式 */
export type LeaveType = 'leave' | 'kick' | 'unknown';

/** 解析后的群名片结构（格式：年龄｜省份｜昵称） */
export interface ParsedGroupCard {
  /** 年龄 */
  age: number;
  /** 省份 */
  province: string;
  /** 昵称 */
  nickname: string;
}

// ---------------------------------------------------------------------------
// OneBot v11 Raw Event Types (from NapCat)
// ---------------------------------------------------------------------------

/** OneBot v11 原始事件基类 */
export interface OneBotRawEvent {
  /** 事件类型：消息 / 通知 / 请求 / 元事件 */
  post_type: 'message' | 'notice' | 'request' | 'meta_event';
  /** 事件发生的 Unix 时间戳（秒） */
  time: number;
  /** 机器人自身 QQ 号 */
  self_id: number;
  /** 允许扩展字段 */
  [key: string]: unknown;
}

/** OneBot v11 群消息事件 */
export interface OneBotGroupMessageEvent extends OneBotRawEvent {
  post_type: 'message';
  message_type: 'group';
  sub_type: 'normal';
  /** 群号 */
  group_id: number;
  /** 发送者 QQ 号 */
  user_id: number;
  /** 消息内容（CQ 字符串或消息段数组） */
  message: string | OneBotMessageSegment[];
  /** 原始消息文本（CQ 码格式） */
  raw_message: string;
  /** 消息 ID */
  message_id: number;
  /** 发送者信息 */
  sender: {
    user_id: number;
    nickname: string;
    card: string;
    role: 'owner' | 'admin' | 'member';
  };
}

/** OneBot v11 消息段 */
export interface OneBotMessageSegment {
  /** 消息段类型（text / at / image / face 等） */
  type: string;
  /** 消息段数据 */
  data: Record<string, unknown>;
}

/** OneBot v11 群通知事件（成员增减） */
export interface OneBotGroupNoticeEvent extends OneBotRawEvent {
  post_type: 'notice';
  /** 通知类型：成员增加 / 成员减少 */
  notice_type: 'group_increase' | 'group_decrease';
  /** 群号 */
  group_id: number;
  /** 相关用户 QQ 号 */
  user_id: number;
  /** 操作者 QQ 号 */
  operator_id?: number;
  /** 子类型：leave / kick / kick_me / approve / invite */
  sub_type?: string;
}

// ---------------------------------------------------------------------------
// OneBot v11 API Response Envelope
// ---------------------------------------------------------------------------

/** OneBot v11 标准 API 响应包装 */
export interface OneBotResponse<T = unknown> {
  /** 响应状态：ok 或 failed */
  status: 'ok' | 'failed';
  /** 返回码，0 表示成功 */
  retcode: number;
  /** 响应数据 */
  data: T;
  /** 错误消息（retcode 非 0 时） */
  message?: string;
  /** 用户可读的错误描述 */
  wording?: string;
}
