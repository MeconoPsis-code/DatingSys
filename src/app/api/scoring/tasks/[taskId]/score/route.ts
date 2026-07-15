import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { logAudit, AUDIT_ACTIONS, getClientIp } from "@/lib/audit";
import { success, error } from "@/lib/api-response";
import { Prisma } from "@prisma/client";
import { getChinaDutyWeekday, getOnDutyScorerIds } from "@/lib/scorer-duty";
import {
  formatChinaDateTime,
  getAssignedScorerIdsForTask,
  getRatingTaskTimeline,
  SCOREABLE_TASK_STATUSES,
} from "@/lib/scoring";
import {
  lockRatingUserTasks,
  syncRatingProfileFromTasks,
} from "@/lib/rating-profile-sync";
import { isValidRatingTaskRevision } from "@/lib/rating-task-revision";

// Valid scores: 0, 0.1, 0.2, ..., 10
function isValidScore(score: number): boolean {
  return score >= 0 && score <= 10 && score * 10 === Math.round(score * 10);
}

/**
 * POST /api/scoring/tasks/[taskId]/score
 *
 * Submit a score for a rating task.
 * Body: { score: number } — 0-10 in 0.1 steps
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const session = await requireAuth();
  const { taskId } = await params;

  if (!can(session.role, "SCORE_PHOTO")) {
    return error("FORBIDDEN", "无权评分", 403);
  }

  // Parse body
  let body;
  try {
    body = await req.json();
  } catch {
    return error("VALIDATION_ERROR", "无效的请求体", 422);
  }

  const { score, taskRevision } = body as {
    score?: number;
    taskRevision?: unknown;
  };

  if (score === undefined || score === null || typeof score !== "number") {
    return error("VALIDATION_ERROR", "请提供评分", 422);
  }

  if (!isValidScore(score)) {
    return error("VALIDATION_ERROR", "评分必须在 0-10 之间，步长 0.1", 422);
  }

  if (!isValidRatingTaskRevision(taskRevision)) {
    return error("VALIDATION_ERROR", "无效的评分任务版本", 422);
  }

  // Find the task
  const task = await db.ratingTask.findUnique({
    where: { id: taskId },
    include: { scores: true },
  });

  if (!task) {
    return error("NOT_FOUND", "评分任务不存在", 404);
  }
  if (task.revision !== taskRevision) {
    return error("CONFLICT", "照片任务已更新，请刷新后重新评分", 409);
  }

  if (
    !SCOREABLE_TASK_STATUSES.includes(
      task.status as (typeof SCOREABLE_TASK_STATUSES)[number]
    )
  ) {
    return error("CONFLICT", "该任务当前不可评分", 409);
  }

  const now = new Date();
  const timeline = getRatingTaskTimeline(task, now);
  if (!timeline.isReleasedForScoring) {
    const message =
      now.getTime() < timeline.publishAt.getTime()
        ? `该任务将于 ${formatChinaDateTime(timeline.publishAt)} 发布给评分员`
        : "该任务已过当日 24:00 评分截止时间";
    return error("SCORING_WINDOW_CLOSED", message, 409);
  }

  const onDutyScorerIds = await getOnDutyScorerIds({
    weekday: getChinaDutyWeekday(timeline.publishAt),
  });
  const eligibleScorerIds = getAssignedScorerIdsForTask({
    status: task.status,
    ratedUserId: task.ratedUserId,
    scorerSnapshot: task.scorerSnapshot,
    onDutyScorerIds,
  });

  if (!eligibleScorerIds.includes(session.id)) {
    return error("FORBIDDEN", "你不在今日评分值班名单中", 403);
  }

  // Check for duplicate score
  const existing = task.scores.find((s) => s.scorerUserId === session.id);
  if (existing) {
    return error("CONFLICT", "你已经评过此任务", 409);
  }

  const eligibleCount = eligibleScorerIds.length;
  const scoringResult = await db.$transaction(async (tx) => {
    await lockRatingUserTasks(tx, task.ratedUserId);
    const currentTask = await tx.ratingTask.findUnique({
      where: { id: taskId },
      select: { status: true, revision: true },
    });
    if (
      !currentTask ||
      currentTask.revision !== taskRevision ||
      !SCOREABLE_TASK_STATUSES.includes(
        currentTask.status as (typeof SCOREABLE_TASK_STATUSES)[number]
      )
    ) {
      return { error: "STALE_TASK" as const };
    }

    const duplicateScore = await tx.ratingScore.findUnique({
      where: {
        ratingTaskId_scorerUserId: {
          ratingTaskId: taskId,
          scorerUserId: session.id,
        },
      },
      select: { id: true },
    });
    if (duplicateScore) {
      return { error: "DUPLICATE_SCORE" as const };
    }

    await tx.ratingScore.create({
      data: {
        ratingTaskId: taskId,
        scorerUserId: session.id,
        score,
      },
    });

    const totalScored = await tx.ratingScore.count({
      where: {
        ratingTaskId: taskId,
        scorerUserId: { in: eligibleScorerIds },
      },
    });
    const allDone = totalScored >= eligibleCount;

    if (allDone) {
      await tx.ratingTask.update({
        where: { id: taskId },
        data: {
          status: "REVIEW",
          completedAt: now,
          scorerSnapshot: eligibleScorerIds,
        },
      });
    } else if (currentTask.status === "PENDING") {
      // Focused rescore tasks retain NEEDS_RESCORE until all assignees finish.
      await tx.ratingTask.updateMany({
        where: { id: taskId, status: "PENDING" },
        data: { status: "SCORING" },
      });
    } else {
      // Touch the task so admin actions that were prepared from an older score
      // set fail their updatedAt compare instead of publishing a stale average.
      await tx.ratingTask.update({
        where: { id: taskId },
        data: { updatedAt: now },
      });
    }

    await syncRatingProfileFromTasks(tx, task.ratedUserId);
    return { allDone, totalScored };
  });
  if ("error" in scoringResult) {
    return scoringResult.error === "DUPLICATE_SCORE"
      ? error("CONFLICT", "你已经评过此任务", 409)
      : error("CONFLICT", "评分任务已更新，请刷新后重新评分", 409);
  }
  const { allDone, totalScored } = scoringResult;

  // Audit log
  await logAudit({
    actorId: session.id,
    action: AUDIT_ACTIONS.PROFILE_UPDATE,
    targetType: "RatingTask",
    targetId: taskId,
    metadata: {
      action: "score_submitted",
      score,
      allDone,
    } as Prisma.InputJsonValue,
    ip: getClientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return success({
    message: allDone ? "评分已全部提交，等待管理员发布" : "评分已提交",
    allDone,
    progress: {
      scored: totalScored,
      total: eligibleCount,
    },
  });
}
