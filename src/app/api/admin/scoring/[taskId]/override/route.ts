import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { success, error } from "@/lib/api-response";
import { notify } from "@/lib/notifications";
import { getChinaDutyWeekday, getOnDutyScorerIds } from "@/lib/scorer-duty";
import {
  getAssignedScorerIdsForTask,
  getScoringTaskTimeline,
  SCOREABLE_TASK_STATUSES,
} from "@/lib/scoring";
import { SCORE_ACTION_REVOCATION_WINDOW_MS } from "@/lib/scoring-revocation";

function canPublishImmediately(status: string) {
  return (
    status === "COMPLETED" ||
    SCOREABLE_TASK_STATUSES.includes(status as (typeof SCOREABLE_TASK_STATUSES)[number])
  );
}

async function getCurrentAssignedScorerIds(task: {
  status: string;
  ratedUserId: string;
  scorerSnapshot: unknown;
  createdAt: Date;
}) {
  const timeline = getScoringTaskTimeline(task.createdAt);
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
 * POST /api/admin/scoring/[taskId]/override
 * Super admin directly sets a custom final score, bypassing individual scorer scores.
 * Body: { score: number } — 0-10, step 0.1
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const session = await requireRole("SUPER_ADMIN");
    const { taskId } = await params;

    const body = await req.json();
    const { score } = body as { score?: number };

    if (score === undefined || score === null || typeof score !== "number") {
      return error("VALIDATION", "请提供评分", 400);
    }

    if (score < 0 || score > 10 || score * 10 !== Math.round(score * 10)) {
      return error("VALIDATION", "评分必须在 0-10 之间，步长 0.1", 400);
    }

    const result = await db.$transaction(async (tx) => {
      const task = await tx.ratingTask.findUnique({ where: { id: taskId } });

      if (!task) {
        throw { code: "NOT_FOUND", message: "评分任务不存在", status: 404 };
      }

      const now = new Date();

      if (canPublishImmediately(task.status)) {
        const scorerSnapshot =
          task.status === "COMPLETED"
            ? undefined
            : await getCurrentAssignedScorerIds(task);

        await tx.ratingTask.update({
          where: { id: taskId },
          data: {
            status: "COMPLETED",
            completedAt: now,
            ...(scorerSnapshot ? { scorerSnapshot } : {}),
            pendingActionType: null,
            pendingActionValue: null,
            pendingActionExpiresAt: null,
            pendingActionActorId: null,
          },
        });

        await tx.ratingProfile.upsert({
          where: { userId: task.ratedUserId },
          create: {
            userId: task.ratedUserId,
            ratingStatus: "COMPLETED",
            finalScore: score,
            scoreCompletedAt: now,
          },
          update: {
            ratingStatus: "COMPLETED",
            finalScore: score,
            scoreCompletedAt: now,
          },
        });

        await tx.auditLog.create({
          data: {
            actorUserId: session.id,
            action: "ADMIN_OVERRIDE_SCORE",
            targetType: "RatingTask",
            targetId: taskId,
            metadata: {
              ratedUserId: task.ratedUserId,
              previousStatus: task.status,
              overriddenScore: score,
              immediatePublish: true,
            },
          },
        });

        return {
          mode: "published" as const,
          ratedUserId: task.ratedUserId,
        };
      }

      if (task.status !== "REVIEW") {
        throw { code: "INVALID_STATUS", message: "该任务当前不可设定评分", status: 400 };
      }

      const expiresAt = new Date(now.getTime() + SCORE_ACTION_REVOCATION_WINDOW_MS);

      await tx.ratingTask.update({
        where: { id: taskId },
        data: {
          status: "REVIEW",
          completedAt: task.completedAt ?? now,
          pendingActionType: "OVERRIDE",
          pendingActionValue: score,
          pendingActionExpiresAt: expiresAt,
          pendingActionActorId: session.id,
        },
      });

      await tx.ratingProfile.upsert({
        where: { userId: task.ratedUserId },
        create: {
          userId: task.ratedUserId,
          ratingStatus: "REVIEW",
        },
        update: {
          ratingStatus: "REVIEW",
          finalScore: null,
          scoreCompletedAt: null,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: session.id,
          action: "ADMIN_OVERRIDE_SCORE_PENDING",
          targetType: "RatingTask",
          targetId: taskId,
          metadata: {
            ratedUserId: task.ratedUserId,
            overriddenScore: score,
            pendingActionExpiresAt: expiresAt.toISOString(),
            revocationWindowMinutes: SCORE_ACTION_REVOCATION_WINDOW_MS / 60000,
          },
        },
      });

      return {
        mode: "scheduled" as const,
        pendingActionExpiresAt: expiresAt.toISOString(),
      };
    });

    if (result.mode === "published") {
      await notify.scoringComplete(result.ratedUserId, score);

      return success({
        message: "最终评分已直接发布",
        finalScore: score,
      });
    }

    return success({
      message: "直接设定评分已提交，将在 5 分钟后生效",
      finalScore: score,
      pendingActionExpiresAt: result.pendingActionExpiresAt,
    });
  } catch (err) {
    console.error("[admin/scoring/override] POST error:", err);
    if (err && typeof err === "object" && "status" in err) {
      const appErr = err as { code: string; message: string; status: number };
      return error(appErr.code, appErr.message, appErr.status);
    }
    return error("INTERNAL_ERROR", "服务器内部错误", 500);
  }
}
