import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { logAudit, AUDIT_ACTIONS, getClientIp } from "@/lib/audit";
import { success, error } from "@/lib/api-response";
import { Prisma } from "@prisma/client";

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

  if (task.status === "COMPLETED") {
    return error("CONFLICT", "该任务已完成评分", 409);
  }

  // Verify scorer is in the snapshot
  const scorerSnapshot = task.scorerSnapshot as string[];
  if (!scorerSnapshot.includes(session.id)) {
    return error("FORBIDDEN", "你不在此任务的评分人名单中", 403);
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

  // Update task status to SCORING if still PENDING
  if (task.status === "PENDING") {
    await db.ratingTask.update({
      where: { id: taskId },
      data: { status: "SCORING" },
    });
  }

  // Check if all eligible scorers have scored
  // Filter out SUPER_ADMIN and the rated user from snapshot
  const eligibleScorers = await db.user.findMany({
    where: {
      id: { in: scorerSnapshot, not: task.ratedUserId },
      role: { in: ["SCORER", "ADMIN"] },
    },
    select: { id: true },
  });
  const eligibleCount = eligibleScorers.length;
  const totalScored = task.scores.length + 1; // +1 for the one we just created
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
    message: allDone ? "评分完成，已计算最终分数" : "评分已提交",
    allDone,
    progress: {
      scored: totalScored,
      total: eligibleCount,
    },
  });
}
