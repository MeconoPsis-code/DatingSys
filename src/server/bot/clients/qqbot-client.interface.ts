/**
 * @file qqbot-client.interface.ts
 * @description QQ 机器人客户端抽象接口
 *
 * 业务逻辑（命令处理、群名片同步等）应依赖此接口而非具体实现，
 * 以便未来可以在 NapCat、go-cqhttp 或其他 OneBot 实现之间无缝切换。
 */

import type { GroupMemberInfo, QQUserInfo, BotMessage } from '../bot.types';

/**
 * Abstract QQ Bot client interface.
 *
 * Business logic should depend on this interface, not on concrete
 * implementations. This allows swapping NapCat for other OneBot
 * implementations (e.g. go-cqhttp, Lagrange) in the future.
 */
export interface QQBotClient {
  /**
   * 获取指定群成员的详细信息
   *
   * @param groupId  - 群号
   * @param qqNumber - 成员 QQ 号
   * @returns 群成员信息（含群名片、角色等）
   */
  getGroupMemberInfo(
    groupId: string,
    qqNumber: string,
  ): Promise<GroupMemberInfo>;

  /**
   * 获取陌生人 / 用户信息（无需同群）
   *
   * @param qqNumber - QQ 号
   * @returns 用户基本信息
   */
  getStrangerInfo(qqNumber: string): Promise<QQUserInfo>;

  /**
   * 设置群成员的群名片（群备注）
   *
   * @param groupId  - 群号
   * @param qqNumber - 目标成员 QQ 号
   * @param card     - 新群名片内容
   */
  setGroupCard(
    groupId: string,
    qqNumber: string,
    card: string,
  ): Promise<void>;

  /**
   * 向群聊发送消息（支持 @提及，通过 CQ 码实现）
   *
   * @param groupId - 目标群号
   * @param message - 消息体（text / at / mixed）
   */
  sendGroupMessage(groupId: string, message: BotMessage): Promise<void>;

  /**
   * 向用户发送私聊消息
   *
   * @param qqNumber - 目标 QQ 号
   * @param message  - 消息体
   */
  sendPrivateMessage(qqNumber: string, message: BotMessage): Promise<void>;

  /**
   * 获取群成员列表
   *
   * @param groupId - 群号
   * @returns 群成员信息数组
   */
  getGroupMemberList(groupId: string): Promise<GroupMemberInfo[]>;
}
