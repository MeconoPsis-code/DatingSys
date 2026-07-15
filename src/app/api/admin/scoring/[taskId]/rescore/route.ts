import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { success, error } from "@/lib/api-response";
import { getChinaDutyWeekday, getOnDutyScorers } from "@/lib/scorer-duty";
import {
  getAssignedScorerIdsForTask,
  getChinaDayStart,
  getRatingTaskTimeline,
  parsePhotoReports,
  parseScorerSnapshot,
} from "@/lib/scoring";
import {
  lockRatingUserTasks,
  syncRatingProfileFromTasks,
} from "@/lib/rating-profile-sync";
import {
  discardOtherUnfinishedRatingTasks,
  hasCurrentPublishedRatingTaskPhotos,
} from "@/lib/rating-task-queue";

// ── POST /api/admin/scoring/[taskId]/rescore — super admin rescore ──

export async function POST(
  req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const session = await requireRole("SUPER_ADMIN");
    const { taskId } = await params;
    const body = await req.json().catch(() => ({}));
    const mode = typeof body?.mode === "string" ? body.mode : "full";

    // Find the task
    const task = await db.ratingTask.findUnique({
      where: { id: taskId },
      include: { scores: { select: { scorerUserId: true } } },
    });
    if (!task) {
      return error("NOT_FOUND", "评分任务不存在", 404);
    }

    if (mode === "reporters_and_unscored" || mode === "reported_only") {
      const rescoreRequestedAt = new Date();
      const scoringPublishAt = getChinaDayStart(rescoreRequestedAt);
      const timeline = getRatingTaskTimeline(
        { createdAt: task.createdAt, scoringPublishAt },
        rescoreRequestedAt
      );
      const reports = parsePhotoReports(task.photoReports);
      if (reports.length === 0) {
        return error("NO_PHOTO_REPORTS", "该任务没有待处理的照片举报", 400);
      }

      const onDutyScorerIds = (
        await getOnDutyScorers({
          excludeUserId: task.ratedUserId,
          weekday: getChinaDutyWeekday(timeline.publishAt),
        })
      ).map((s) => s.id);
      const snapshotScorerIds = parseScorerSnapshot(task.scorerSnapshot);
      const previouslyAssignedScorerIds =
        task.status === "REPORTED"
          ? Array.from(new Set([...snapshotScorerIds, ...onDutyScorerIds])).filter(
              (id) => id !== task.ratedUserId
            )
          : getAssignedScorerIdsForTask({
              status: task.status,
              ratedUserId: task.ratedUserId,
              scorerSnapshot: task.scorerSnapshot,
              onDutyScorerIds,
            });
      const scoredScorerIds = new Set(task.scores.map((score) => score.scorerUserId));
      const reporterIds = reports.map((report) => report.reporterId);
      const unscoredScorerIds = previouslyAssignedScorerIds.filter(
        (id) => !scoredScorerIds.has(id)
      );
      const candidateScorerIds = Array.from(
        new Set([...reporterIds, ...unscoredScorerIds])
      ).filter((id) => id !== task.ratedUserId);

      const eligibleScorers = candidateScorerIds.length
        ? await db.user.findMany({
            where: {
              id: { in: candidateScorerIds },
              status: "ACTIVE",
              role: { in: ["SCORER", "ADMIN"] },
            },
            select: { id: true },
          })
        : [];
      const targetScorerIds = candidateScorerIds.filter((id) =>
        eligibleScorers.some((scorer) => scorer.id === id)
      );

      if (targetScorerIds.length === 0) {
        return error("NO_TARGET_SCORERS", "没有可重新分配的评分员", 400);
      }

      await db.$transaction(async (tx) => {
        await lockRatingUserTasks(tx, task.ratedUserId);
        const currentTask = await tx.ratingTask.findUnique({
          where: { id: taskId },
          select: {
            updatedAt: true,
            ratedUserId: true,
            photoObjectKey: true,
            photoObjectKeys: true,
          },
        });
        if (
          !currentTask ||
          currentTask.updatedAt.getTime() !== task.updatedAt.getTime()
        ) {
          throw {
            code: "CONFLICT",
            message: "评分任务已更新，请刷新后重试",
            status: 409,
          };
        }
        if (!(await hasCurrentPublishedRatingTaskPhotos(tx, currentTask))) {
          throw {
            code: "UNPUBLISHED_PHOTOS",
            message: "任务包含未发布或已撤回的照片，不能重新评分",
            status: 409,
          };
        }
        await discardOtherUnfinishedRatingTasks(tx, {
          ratedUserId: task.ratedUserId,
          exceptTaskId: taskId,
        });
        await tx.ratingScore.deleteMany({
          where: {
            ratingTaskId: taskId,
            scorerUserId: { in: targetScorerIds },
          },
        });
        await tx.ratingTask.update({
          where: { id: taskId },
          data: {
            status: "NEEDS_RESCORE",
            publishedScore: null,
            revision: { increment: 1 },
            completedAt: null,
            scoringPublishAt,
            scorerSnapshot: targetScorerIds,
            photoReports: [],
            pendingActionType: null,
            pendingActionValue: null,
            pendingActionExpiresAt: null,
            pendingActionActorId: null,
          },
        });
        await syncRatingProfileFromTasks(tx, task.ratedUserId);
      });

      await db.auditLog.create({
        data: {
          actorUserId: session.id,
          action: "ADMIN_REPORT_NO_REVOKE_RESCORE",
          targetType: "RatingTask",
          targetId: taskId,
          metadata: {
            ratedUserId: task.ratedUserId,
            reporterIds,
            unscoredScorerIds,
            targetScorerIds,
            retainedScoreCount:
              task.scores.length -
              task.scores.filter((score) => targetScorerIds.includes(score.scorerUserId))
                .length,
          },
        },
      });

      return success({
        message: "已清除举报并仅分配给举报评分员及未评分评分员重新评分",
        scorerCount: targetScorerIds.length,
      });
    }

    const rescoreRequestedAt = new Date();
    const scoringPublishAt = getChinaDayStart(rescoreRequestedAt);
    const timeline = getRatingTaskTimeline(
      { createdAt: task.createdAt, scoringPublishAt },
      rescoreRequestedAt
    );

    // Rebuild from the publish day's on-duty roster, excluding the rated user.
    const scorers = await getOnDutyScorers({
      excludeUserId: task.ratedUserId,
      weekday: getChinaDutyWeekday(timeline.publishAt),
    });
    const newScorerSnapshot = scorers.map((s) => s.id);

    // Transaction: delete scores, reset task, then aggregate every batch.
    await db.$transaction(async (tx) => {
      await lockRatingUserTasks(tx, task.ratedUserId);
      const currentTask = await tx.ratingTask.findUnique({
        where: { id: taskId },
        select: {
          updatedAt: true,
          ratedUserId: true,
          photoObjectKey: true,
          photoObjectKeys: true,
        },
      });
      if (!currentTask || currentTask.updatedAt.getTime() !== task.updatedAt.getTime()) {
        throw {
          code: "CONFLICT",
          message: "评分任务已更新，请刷新后重试",
          status: 409,
        };
      }
      if (!(await hasCurrentPublishedRatingTaskPhotos(tx, currentTask))) {
        throw {
          code: "UNPUBLISHED_PHOTOS",
          message: "任务包含未发布或已撤回的照片，不能重新评分",
          status: 409,
        };
      }
      await discardOtherUnfinishedRatingTasks(tx, {
        ratedUserId: task.ratedUserId,
        exceptTaskId: taskId,
      });
      await tx.ratingScore.deleteMany({ where: { ratingTaskId: taskId } });
      await tx.ratingTask.update({
        where: { id: taskId },
        data: {
          status: "PENDING",
          publishedScore: null,
          revision: { increment: 1 },
          completedAt: null,
          scoringPublishAt,
          scorerSnapshot: newScorerSnapshot,
          photoReports: [],
          pendingActionType: null,
          pendingActionValue: null,
          pendingActionExpiresAt: null,
          pendingActionActorId: null,
        },
      });
      await syncRatingProfileFromTasks(tx, task.ratedUserId);
    });

    // Audit log
    await db.auditLog.create({
      data: {
        actorUserId: session.id,
        action: "ADMIN_RESCORE",
        targetType: "RatingTask",
        targetId: taskId,
        metadata: {
          ratedUserId: task.ratedUserId,
          newScorerCount: newScorerSnapshot.length,
          clearedPhotoReports: Array.isArray(task.photoReports)
            ? task.photoReports.length
            : 0,
        },
      },
    });

    return success({
      message: "已重置评分，所有评分员将重新评分",
      scorerCount: newScorerSnapshot.length,
    });
  } catch (err) {
    console.error("[admin/scoring/rescore] POST error:", err);
    if (err && typeof err === "object" && "status" in err) {
      const appErr = err as { code: string; message: string; status: number };
      return error(appErr.code, appErr.message, appErr.status);
    }
    return error("INTERNAL_ERROR", "服务器内部错误", 500);
  }
}
