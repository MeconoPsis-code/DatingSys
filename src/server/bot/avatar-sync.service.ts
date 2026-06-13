/**
 * @file avatar-sync.service.ts
 * @description QQ 头像同步服务
 *
 * 提供 QQ 头像 CDN 地址生成与 BotIdentity 记录同步功能。
 * 头像来源为腾讯 QQ 头像 CDN（q1.qlogo.cn），尺寸固定 640×640。
 *
 * @module server/bot/avatar-sync.service
 */

import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';

const log = createLogger('bot:avatar-sync');

/**
 * 根据 QQ 号生成 QQ 头像 CDN 地址。
 *
 * @param qqNumber - QQ 号
 * @returns 640×640 头像直链
 *
 * @example
 * ```ts
 * getQQAvatarUrl('123456');
 * // => 'https://q1.qlogo.cn/g?b=qq&nk=123456&s=640'
 * ```
 */
export function getQQAvatarUrl(qqNumber: string): string {
  return `https://q1.qlogo.cn/g?b=qq&nk=${qqNumber}&s=640`;
}

/**
 * 将 QQ 头像 URL 同步到 BotIdentity 表。
 *
 * - 若记录已存在，仅更新头像 URL 及同步时间。
 * - 若记录不存在，创建一条包含默认字段的新记录。
 *
 * @param qqNumber - QQ 号
 *
 * @example
 * ```ts
 * await syncAvatar('123456');
 * ```
 */
export async function syncAvatar(qqNumber: string): Promise<void> {
  const avatarUrl = getQQAvatarUrl(qqNumber);

  await db.botIdentity.upsert({
    where: { qqNumber },
    update: {
      qqAvatarUrl: avatarUrl,
      qqAvatarSyncedAt: new Date(),
    },
    create: {
      qqNumber,
      qqEmail: `${qqNumber}@qq.com`,
      qqAvatarUrl: avatarUrl,
      qqAvatarSyncedAt: new Date(),
      groupId: '',
      registeredFromGroupId: '',
    },
  });

  log.info({ qqNumber }, 'Avatar synced');
}
