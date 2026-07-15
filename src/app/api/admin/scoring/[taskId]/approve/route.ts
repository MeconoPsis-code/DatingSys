import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { success, error } from "@/lib/api-response";
import { notify } from "@/lib/notifications";
import { getChinaDutyWeekday, getOnDutyScorerIds } from "@/lib/scorer-duty";
import {
  calculateAverageScore,
  getAssignedScorerIdsForTask,
  getRatingTaskTimeline,
  SCOREABLE_TASK_STATUSES,
} from "@/lib/scoring";
import { SCORE_ACTION_REVOCATION_WINDOW_MS } from "@/lib/scoring-revocation";
import {
  lockRatingUserTasks,
  syncRatingProfileFromTasks,
} from "@/lib/rating-profile-sync";

function canPublishImmediately(status: string) {
  return SCOREABLE_TASK_STATUSES.includes(
    status as (typeof SCOREABLE_TASK_STATUSES)[number]
  );
}

async function getCurrentAssignedScorerIds(task: {
  status: string;
  ratedUserId: string;
  scorerSnapshot: unknown;
  createdAt: Date;
  scoringPublishAt: Date | null;
}) {
  const timeline = getRatingTaskTimeline(task);
  const onDutyScorerIds = await getOnDutyScorerIds({
    weekday: getChinaDutyWeekday(timeline.publishAt),
  });

  return getAssignedScorerIdsForTask({
    status: task.status,
    ratedUserId: task.ratedUserId,
    scorerSnapshot: task.scorerSnapshot,
    onDutyScorerIds: onDutyScorerIds.filter((id) => id !== task.ratedUserId),
  });
}

/**
 * POST /api/admin/scoring/[taskId]/approve
 * Super admin either schedules review approval or immediately ends active scoring
 * and publishes the current live average.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const session = await requireRole("SUPER_ADMIN");
    const { taskId } = await params;

    const task = await db.ratingTask.findUnique({
      where: { id: taskId },
      include: { scores: { select: { score: true } } },
    });

    if (!task) {
      throw { code: "NOT_FOUND", message: "评分任务不存在", status: 404 };
    }

    const finalScore = calculateAverageScore(task.scores);
    if (finalScore === null) {
      throw {
        code: "NO_SCORES",
        message: "当前还没有评分，无法发布最终分数",
        status: 400,
      };
    }

    const now = new Date();

    if (canPublishImmediately(task.status)) {
      const assignedScorerIds = await getCurrentAssignedScorerIds(task);

      const published = await db.$transaction(async (tx) => {
        await lockRatingUserTasks(tx, task.ratedUserId);
        const updated = await tx.ratingTask.updateMany({
          where: {
            id: taskId,
            status: task.status,
            updatedAt: task.updatedAt,
          },
          data: {
            status: "COMPLETED",
            publishedScore: finalScore,
            completedAt: now,
            scorerSnapshot: assignedScorerIds,
            pendingActionType: null,
            pendingActionValue: null,
            pendingActionExpiresAt: null,
            pendingActionActorId: null,
          },
        });

        if (updated.count === 0) {
          throw {
            code: "CONFLICT",
            message: "评分任务状态已变化，请刷新后重试",
            status: 409,
          };
        }

        const profileState = await syncRatingProfileFromTasks(tx, task.ratedUserId);

        await tx.auditLog.create({
          data: {
            actorUserId: session.id,
            action: "ADMIN_FORCE_APPROVE_SCORE",
            targetType: "RatingTask",
            targetId: taskId,
            metadata: {
              ratedUserId: task.ratedUserId,
              previousStatus: task.status,
              finalScore,
              scoredCount: task.scores.length,
              assignedScorerCount: assignedScorerIds.length,
              immediatePublish: true,
            },
          },
        });

        return {
          finalScore,
          publishedFinalScore: profileState.finalScore,
          shouldNotifyCompletion: profileState.shouldNotifyCompletion,
        };
      });

      if (published.shouldNotifyCompletion && published.publishedFinalScore !== null) {
        await notify.scoringComplete(task.ratedUserId, published.publishedFinalScore);
      }

      return success({
        message: published.shouldNotifyCompletion
          ? "已终止打分并按当前均分直接发布"
          : "当前批次已完成，仍有其他批次待评分",
        finalScore: published.finalScore,
        publishedImmediately: published.shouldNotifyCompletion,
      });
    }

    if (task.status !== "REVIEW") {
      throw { code: "INVALID_STATUS", message: "该任务当前不可发布评分", status: 400 };
    }

    const scheduled = await db.$transaction(async (tx) => {
      await lockRatingUserTasks(tx, task.ratedUserId);
      const current = await tx.ratingTask.findUnique({
        where: { id: taskId },
        select: { status: true, updatedAt: true },
      });

      if (
        current?.status !== "REVIEW" ||
        current.updatedAt.getTime() !== task.updatedAt.getTime()
      ) {
        throw {
          code: "CONFLICT",
          message: "评分任务状态已变化，请刷新后重试",
          status: 409,
        };
      }

      const expiresAt = new Date(now.getTime() + SCORE_ACTION_REVOCATION_WINDOW_MS);

      await tx.ratingTask.update({
        where: { id: taskId },
        data: {
          status: "REVIEW",
          completedAt: task.completedAt ?? now,
          pendingActionType: "APPROVE",
          pendingActionValue: null,
          pendingActionExpiresAt: expiresAt,
          pendingActionActorId: session.id,
        },
      });

      await syncRatingProfileFromTasks(tx, task.ratedUserId);

      await tx.auditLog.create({
        data: {
          actorUserId: session.id,
          action: "ADMIN_APPROVE_SCORE_PENDING",
          targetType: "RatingTask",
          targetId: taskId,
          metadata: {
            ratedUserId: task.ratedUserId,
            finalScore,
            scoredCount: task.scores.length,
            pendingActionExpiresAt: expiresAt.toISOString(),
            revocationWindowMinutes: SCORE_ACTION_REVOCATION_WINDOW_MS / 60000,
          },
        },
      });

      return {
        finalScore,
        pendingActionExpiresAt: expiresAt.toISOString(),
      };
    });

    return success({
      message: "评分审核通过已提交，将在 5 分钟后生效",
      finalScore: scheduled.finalScore,
      pendingActionExpiresAt: scheduled.pendingActionExpiresAt,
    });
  } catch (err) {
    console.error("[admin/scoring/approve] POST error:", err);
    if (err && typeof err === "object" && "status" in err) {
      const appErr = err as { code: string; message: string; status: number };
      return error(appErr.code, appErr.message, appErr.status);
    }
    return error("INTERNAL_ERROR", "服务器内部错误", 500);
  }
}
