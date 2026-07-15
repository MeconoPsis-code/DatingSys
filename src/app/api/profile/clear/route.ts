import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { logAudit, AUDIT_ACTIONS, getClientIp } from "@/lib/audit";
import { success, error } from "@/lib/api-response";
import { CLEAR_COOLDOWN_DAYS } from "@/lib/validations/profile";
import { lockRatingUserTasks } from "@/lib/rating-profile-sync";

/**
 * POST /api/profile/clear
 *
 * Delete the current user's profile and preference records.
 * Sets lastProfileClearedAt on the User for 30-day publish cooldown.
 * Preserves account, auth, and audit records.
 */
export async function POST(req: Request) {
  const session = await requireAuth();
  const isSuperAdmin = session.role === "SUPER_ADMIN";

  // 1. Find existing profile
  const profile = await db.profile.findUnique({
    where: { userId: session.id },
  });

  if (!profile) {
    return error("NOT_FOUND", "没有资料可以清空", 404);
  }

  // 2. Delete profile + preference + rating data, set clear timestamp on User
  await db.$transaction(async (tx) => {
    await lockRatingUserTasks(tx, session.id);
    // All task batches are invalid once every profile photo is cleared.
    await tx.ratingTask.deleteMany({ where: { ratedUserId: session.id } });
    await tx.ratingProfile.deleteMany({ where: { userId: session.id } });
    await tx.preference.deleteMany({ where: { userId: session.id } });
    await tx.profile.delete({ where: { userId: session.id } });
    await tx.user.update({
      where: { id: session.id },
      data: { lastProfileClearedAt: isSuperAdmin ? null : new Date() },
    });
  });

  // 3. Audit log
  await logAudit({
    actorId: session.id,
    action: AUDIT_ACTIONS.PROFILE_CLEAR,
    targetType: "Profile",
    targetId: profile.id,
    ip: getClientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return success({
    message: isSuperAdmin
      ? "资料已清空。超级管理员账号不受重新发布冷却限制。"
      : `资料已清空。${CLEAR_COOLDOWN_DAYS} 天内无法重新发布。`,
  });
}
