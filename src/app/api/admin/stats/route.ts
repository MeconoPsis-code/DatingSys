import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { success, error } from "@/lib/api-response";
import { getChinaDayStart } from "@/lib/scoring";
import { promoteExpiredScoringTasks } from "@/lib/scoring-deadlines";
import { commitExpiredActions } from "@/lib/scoring-revocation";

const OPEN_SCORING_TASK_STATUSES = [
  "PENDING",
  "SCORING",
  "NEEDS_RESCORE",
  "REPORTED",
  "REVIEW",
] as const;

function countUniquePairs(rows: Array<{ userId: string; targetUserId: string }>) {
  const pairKeys = new Set<string>();

  for (const row of rows) {
    const [a, b] =
      row.userId < row.targetUserId
        ? [row.userId, row.targetUserId]
        : [row.targetUserId, row.userId];
    pairKeys.add(`${a}:${b}`);
  }

  return pairKeys.size;
}

// ── GET /api/admin/stats ────────────────────────────────

export async function GET() {
  try {
    await requireRole("ADMIN");
    await commitExpiredActions();
    await promoteExpiredScoringTasks();

    const todayStart = getChinaDayStart(new Date());

    const [
      totalUsers,
      activeUsers,
      bannedUsers,
      warnedUsers,
      verifiedMembers,
      pendingMembers,
      pendingReports,
      reviewingReports,
      scoringInProgress,
      todayNewUsers,
      todayMutualMatchRows,
    ] = await Promise.all([
      db.user.count({ where: { status: { not: "DELETED" } } }),
      db.user.count({ where: { status: "ACTIVE" } }),
      db.user.count({ where: { status: "BANNED" } }),
      db.penalty.groupBy({
        by: ['userId'],
        where: { type: 'WARNING', revokedAt: null },
      }).then((g) => g.length),
      db.groupMembership.count({ where: { status: "VERIFIED" } }),
      db.groupMembership.count({
        where: { status: { in: ["PENDING", "LEFT_PENDING_REVIEW"] } },
      }),
      db.report.count({ where: { status: "PENDING" } }),
      db.report.count({ where: { status: "REVIEWING" } }),
      db.ratingTask.count({
        where: { status: { in: [...OPEN_SCORING_TASK_STATUSES] } },
      }),
      db.user.count({
        where: { createdAt: { gte: todayStart }, status: { not: "DELETED" } },
      }),
      db.matchSnapshot.findMany({
        where: {
          matchType: "mutual",
          mutualMatchedAt: { gte: todayStart },
        },
        select: {
          userId: true,
          targetUserId: true,
        },
      }),
    ]);
    const todayMatches = countUniquePairs(todayMutualMatchRows);

    return success({
      totalUsers,
      activeUsers,
      bannedUsers,
      warnedUsers,
      verifiedMembers,
      pendingMembers,
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
