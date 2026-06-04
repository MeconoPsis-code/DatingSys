import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { logAudit, AUDIT_ACTIONS, getClientIp } from "@/lib/audit";
import { success, error } from "@/lib/api-response";
import { CLEAR_COOLDOWN_DAYS } from "@/lib/validations/profile";

/**
 * POST /api/profile/clear
 *
 * Delete the current user's profile and preference records.
 * Sets lastProfileClearedAt on the User for 30-day publish cooldown.
 * Preserves account, auth, and audit records.
 */
export async function POST(req: Request) {
  const session = await requireAuth();

  // 1. Find existing profile
  const profile = await db.profile.findUnique({
    where: { userId: session.id },
  });

  if (!profile) {
    return error("NOT_FOUND", "没有资料可以清空", 404);
  }

  // 2. Delete profile + preference, set clear timestamp on User
  await db.$transaction([
    db.preference.deleteMany({ where: { userId: session.id } }),
    db.profile.delete({ where: { userId: session.id } }),
    db.user.update({
      where: { id: session.id },
      data: { lastProfileClearedAt: new Date() },
    }),
  ]);

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
    message: `资料已清空。${CLEAR_COOLDOWN_DAYS} 天内无法重新发布。`,
  });
}
