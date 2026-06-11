import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { success, error } from "@/lib/api-response";

// ── GET /api/admin/stats ────────────────────────────────

export async function GET() {
  try {
    const session = await requireRole("ADMIN");

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      totalUsers,
      activeUsers,
      bannedUsers,
      warnedUsers,
      verifiedMembers,
      pendingMembers,
      expiredMembers,
      pendingReports,
      reviewingReports,
      scoringInProgress,
      todayNewUsers,
      todayMatches,
    ] = await Promise.all([
      db.user.count({ where: { status: { not: "DELETED" } } }),
      db.user.count({ where: { status: "ACTIVE" } }),
      db.user.count({ where: { status: "BANNED" } }),
      db.penalty.groupBy({
        by: ['userId'],
        where: { type: 'WARNING', revokedAt: null },
      }).then((g) => g.length),
      db.groupMembership.count({ where: { status: "VERIFIED" } }),
      db.groupMembership.count({ where: { status: "PENDING" } }),
      db.groupMembership.count({ where: { status: "EXPIRED" } }),
      db.report.count({ where: { status: "PENDING" } }),
      db.report.count({ where: { status: "REVIEWING" } }),
      db.ratingProfile.count({ where: { ratingStatus: "SCORING" } }),
      db.user.count({
        where: { createdAt: { gte: todayStart }, status: { not: "DELETED" } },
      }),
      db.matchSnapshot.count({
        where: { computedAt: { gte: todayStart } },
      }),
    ]);

    return success({
      totalUsers,
      activeUsers,
      bannedUsers,
      warnedUsers,
      verifiedMembers,
      pendingMembers,
      expiredMembers,
      pendingReports,
      reviewingReports,
      scoringInProgress,
      todayNewUsers,
      todayMatches,
    });
  } catch (err) {
    console.error("[admin/stats] GET error:", err);
    if (err && typeof err === "object" && "status" in err) {
      const appErr = err as { code: string; message: string; status: number };
      return error(appErr.code, appErr.message, appErr.status);
    }
    return error("INTERNAL_ERROR", "服务器内部错误", 500);
  }
}
