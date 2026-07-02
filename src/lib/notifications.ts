/**
 * Notification Helper — Create system notifications for users.
 *
 * Usage:
 *   import { notify } from "@/lib/notifications";
 *   await notify.scoringComplete(userId, score);
 */

import { db } from "@/lib/db";

// ── Core create function ────────────────────────────────

async function create(
  userId: string,
  type: string,
  title: string,
  message: string
): Promise<void> {
  try {
    await db.notification.create({
      data: { userId, type, title, message },
    });
  } catch (err) {
    // Best-effort — never break the calling flow
    console.error("[notify] Failed to create notification:", err);
  }
}

// ── Typed notification senders ──────────────────────────

export const notify = {
  /** Photo scoring completed */
  async scoringComplete(userId: string, score: number) {
    await create(
      userId,
      "SCORING_COMPLETE",
      "评分完成",
      `你的照片评分已完成，请前往「匹配偏好设置」选择你的匹配方式后进入匹配池。`
    );
    await create(
      userId,
      "RANKING_INVITE",
      "是否参与颜值排行？",
      `你的颜值分为 ${score.toFixed(1)}。请前往「我的账号」开启或关闭公开娱乐排行。`
    );
  },

  /** Photo scoring task queued */
  async scoringQueued(userId: string, queuePosition: number) {
    const queueMsg =
      queuePosition > 0
        ? `目前排在你前面的有 ${queuePosition} 位用户，请耐心等待。`
        : `你是当前队列中的第一位，评分将很快开始。`;
    await create(
      userId,
      "SCORING_QUEUED",
      "资料发布成功",
      `你的资料已成功发布！照片已进入评分队列，评分员将按顺序对你的照片进行评分。${queueMsg}`
    );
  },

  /** Published profile photos were revoked after an abnormal-photo report */
  async photosRevoked(
    userId: string,
    reason: string,
    cooldownLabel: string,
    cooldownBypassed = false
  ) {
    const republishText = cooldownBypassed
      ? "超级管理员账号不受重新发布冷却限制，你可以立即重新上传并发布照片。"
      : `你可以在 ${cooldownLabel} 后重新上传并发布照片。`;

    await create(
      userId,
      "PHOTO_REVOKED",
      "照片已被撤销",
      `你的照片因违反「${reason}」已被撤销。在重新发布照片前，系统会将你视为未上传照片用户。${republishText}`
    );
  },

  /** Someone sent you a view request */
  async viewRequestReceived(userId: string, requesterName: string) {
    await create(
      userId,
      "VIEW_REQUEST_RECEIVED",
      "收到资料查看申请",
      `${requesterName || "匿名用户"} 向你发起了资料查看申请，请前往「申请管理」处理。`
    );
  },

  /** Your view request was approved */
  async viewRequestApproved(userId: string, targetName: string) {
    await create(
      userId,
      "VIEW_REQUEST_APPROVED",
      "资料查看申请已通过",
      `${targetName || "对方"} 已通过了你的资料查看申请，可前往「申请管理」或匹配页面查看完整资料。`
    );
  },

  /** Your view request was rejected */
  async viewRequestRejected(
    userId: string,
    targetName: string,
    cooldownBypassed = false
  ) {
    const retryText = cooldownBypassed
      ? "超级管理员账号可立即重新申请。"
      : "7天后可重新申请。";

    await create(
      userId,
      "VIEW_REQUEST_REJECTED",
      "资料查看申请被拒绝",
      `${targetName || "对方"} 拒绝了你的资料查看申请。${retryText}`
    );
  },

  /** Account warning or penalty */
  async penaltyWarning(userId: string, reason: string) {
    await create(
      userId,
      "PENALTY_WARNING",
      "账号警告",
      `你的账号收到一条警告：${reason}`
    );
  },

  /** Account banned */
  async accountBanned(userId: string, reason: string) {
    await create(
      userId,
      "PENALTY_WARNING",
      "账号已被封禁",
      `你的账号已被封禁，原因：${reason}`
    );
  },

  /** Generic system notification */
  async system(userId: string, title: string, message: string) {
    await create(userId, "SYSTEM", title, message);
  },
};
