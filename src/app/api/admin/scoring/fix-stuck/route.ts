import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { success, error } from "@/lib/api-response";
import { getChinaDutyWeekday, getOnDutyScorerIds } from "@/lib/scorer-duty";
import {
  getAssignedScorerIdsForTask,
  getRatingTaskTimeline,
  parseScorerSnapshot,
} from "@/lib/scoring";
import {
  lockRatingUserTasks,
  syncRatingProfileFromTasks,
} from "@/lib/rating-profile-sync";

/**
 * POST /api/admin/scoring/fix-stuck
 * Super admin: find all non-COMPLETED, non-REVIEW tasks where all eligible
 * scorers have already scored, and promote them to REVIEW.
 */
export async function POST() {
  try {
    await requireRole("SUPER_ADMIN");

    // Find tasks that are not yet in REVIEW or COMPLETED. REPORTED tasks
    // must be resolved by a super admin before they can move forward.
    const stuckTasks = await db.ratingTask.findMany({
      where: {
        status: { notIn: ["REVIEW", "COMPLETED", "REPORTED"] },
      },
      include: {
        scores: { select: { id: true, scorerUserId: true } },
      },
    });

    let fixedCount = 0;
    const debugInfo: Array<{
      taskId: string;
      status: string;
      snapshotLength: number;
      eligibleCount: number;
      scoredCount: number;
      promoted: boolean;
    }> = [];

    for (const task of stuckTasks) {
      const scorerIds = parseScorerSnapshot(task.scorerSnapshot);
      const timeline = getRatingTaskTimeline(task);
      const onDutyScorerIds = await getOnDutyScorerIds({
        weekday: getChinaDutyWeekday(timeline.publishAt),
      });
      const eligibleScorerIds = getAssignedScorerIdsForTask({
        status: task.status,
        ratedUserId: task.ratedUserId,
        scorerSnapshot: task.scorerSnapshot,
        onDutyScorerIds,
      });
      const eligibleScorerIdSet = new Set(eligibleScorerIds);
      const eligibleCount = eligibleScorerIds.length;
      const scoredCount = task.scores.filter((score) =>
        eligibleScorerIdSet.has(score.scorerUserId)
      ).length;
      const shouldPromote = eligibleCount > 0 && scoredCount >= eligibleCount;

      debugInfo.push({
        taskId: task.id,
        status: task.status,
        snapshotLength: scorerIds.length,
        eligibleCount,
        scoredCount,
        promoted: shouldPromote,
      });

      if (shouldPromote) {
        const promoted = await db.$transaction(async (tx) => {
          await lockRatingUserTasks(tx, task.ratedUserId);
          const currentTask = await tx.ratingTask.findUnique({
            where: { id: task.id },
            include: { scores: { select: { scorerUserId: true } } },
          });
          if (
            !currentTask ||
            currentTask.status !== task.status ||
            currentTask.updatedAt.getTime() !== task.updatedAt.getTime()
          ) {
            return false;
          }
          const currentScoredCount = currentTask.scores.filter((score) =>
            eligibleScorerIdSet.has(score.scorerUserId)
          ).length;
          if (currentScoredCount < eligibleCount) return false;

          const updated = await tx.ratingTask.updateMany({
            where: {
              id: task.id,
              status: task.status,
              updatedAt: task.updatedAt,
            },
            data: {
              status: "REVIEW",
              completedAt: task.completedAt ?? new Date(),
              scorerSnapshot: eligibleScorerIds,
            },
          });
          if (updated.count === 0) return false;
          await syncRatingProfileFromTasks(tx, task.ratedUserId);
          return true;
        });

        if (promoted) {
          fixedCount++;
        } else {
          debugInfo[debugInfo.length - 1].promoted = false;
        }
      }
    }

    return success({
      message: `已修复 ${fixedCount} 个卡住的评分任务（共扫描 ${stuckTasks.length} 个）`,
      fixedCount,
      scanned: stuckTasks.length,
      debug: debugInfo,
    });
  } catch (err) {
    console.error("[admin/scoring/fix-stuck] POST error:", err);
    if (err && typeof err === "object" && "status" in err) {
      const appErr = err as { code: string; message: string; status: number };
      return error(appErr.code, appErr.message, appErr.status);
    }
    return error("INTERNAL_ERROR", "服务器内部错误", 500);
  }
}
