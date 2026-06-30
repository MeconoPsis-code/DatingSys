import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { logAudit, AUDIT_ACTIONS, getClientIp } from "@/lib/audit";
import { success, error } from "@/lib/api-response";
import { Prisma } from "@prisma/client";
import { getOnDutyScorerIds } from "@/lib/scorer-duty";
import { getAssignedScorerIdsForTask, SCOREABLE_TASK_STATUSES } from "@/lib/scoring";

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

  const { score } = body as { score?: number };

  if (score === undefined || score === null || typeof score !== "number") {
    return error("VALIDATION_ERROR", "请提供评分", 422);
  }

  if (!isValidScore(score)) {
    return error("VALIDATION_ERROR", "评分必须在 0-10 之间，步长 0.1", 422);
  }

  // Find the task
  const task = await db.ratingTask.findUnique({
    where: { id: taskId },
    include: { scores: true },
  });

  if (!task) {
    return error("NOT_FOUND", "评分任务不存在", 404);
  }

  if (!SCOREABLE_TASK_STATUSES.includes(task.status as (typeof SCOREABLE_TASK_STATUSES)[number])) {
    return error("CONFLICT", "该任务当前不可评分", 409);
  }

  const onDutyScorerIds = await getOnDutyScorerIds({
    excludeUserId: task.ratedUserId,
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

  // Create the score
  await db.ratingScore.create({
    data: {
      ratingTaskId: taskId,
      scorerUserId: session.id,
      score,
    },
  });

  // Normal queue tasks move into SCORING after the first score. Focused
  // rescore tasks keep NEEDS_RESCORE so assignment stays on the snapshot.
  if (task.status === "PENDING") {
    await db.ratingTask.update({
      where: { id: taskId },
      data: { status: "SCORING" },
    });

    await db.ratingProfile.upsert({
      where: { userId: task.ratedUserId },
      create: {
        userId: task.ratedUserId,
        ratingStatus: "SCORING",
      },
      update: {
        ratingStatus: "SCORING",
      },
    });
  }

  // Check if all currently on-duty eligible scorers have scored.
  const eligibleCount = eligibleScorerIds.length;
  const totalScored = await db.ratingScore.count({
    where: {
      ratingTaskId: taskId,
      scorerUserId: { in: eligibleScorerIds },
    },
  });
  const allDone = totalScored >= eligibleCount;

  if (allDone) {
    // All scorers done — move to REVIEW for super admin approval
    await db.ratingTask.update({
      where: { id: taskId },
      data: {
        status: "REVIEW",
        completedAt: new Date(),
      },
    });

    await db.ratingProfile.upsert({
      where: { userId: task.ratedUserId },
      create: {
        userId: task.ratedUserId,
        ratingStatus: "REVIEW",
      },
      update: {
        ratingStatus: "REVIEW",
      },
    });
  }

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
