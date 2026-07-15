import { db } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { calculateAverageScore } from "@/lib/scoring";
import {
  lockRatingUserTasks,
  syncRatingProfileFromTasks,
} from "@/lib/rating-profile-sync";
import { hasCurrentPublishedRatingTaskPhotos } from "@/lib/rating-task-queue";

export const SCORE_ACTION_REVOCATION_WINDOW_MS = 5 * 60 * 1000;

/**
 * Commits any rating task superadmin decisions whose 5-minute revocation window has expired.
 * Processes APPROVE and OVERRIDE actions.
 */
export async function commitExpiredActions() {
  const now = new Date();

  // Find all REVIEW status tasks with an expired pendingActionExpiresAt
  const expiredTasks = await db.ratingTask.findMany({
    where: {
      status: "REVIEW",
      pendingActionType: { in: ["APPROVE", "OVERRIDE"] },
      pendingActionExpiresAt: {
        lte: now,
      },
    },
    include: {
      scores: { select: { score: true } },
    },
  });

  for (const task of expiredTasks) {
    try {
      const approvedFinalScore =
        task.pendingActionType === "APPROVE" ? calculateAverageScore(task.scores) : null;
      if (task.pendingActionType === "APPROVE" && approvedFinalScore === null) {
        continue;
      }

      const actorUserId = task.pendingActionActorId || null;
      const finalScore =
        task.pendingActionType === "APPROVE"
          ? (approvedFinalScore as number)
          : (task.pendingActionValue ?? 0);
      const committed = await db.$transaction(async (tx) => {
        await lockRatingUserTasks(tx, task.ratedUserId);
        if (!(await hasCurrentPublishedRatingTaskPhotos(tx, task))) {
          return null;
        }
        const updated = await tx.ratingTask.updateMany({
          where: {
            id: task.id,
            status: "REVIEW",
            pendingActionExpiresAt: task.pendingActionExpiresAt,
          },
          data: {
            status: "COMPLETED",
            publishedScore: finalScore,
            completedAt: now,
            pendingActionType: null,
            pendingActionValue: null,
            pendingActionExpiresAt: null,
            pendingActionActorId: null,
          },
        });
        if (updated.count === 0) return null;

        const profileState = await syncRatingProfileFromTasks(tx, task.ratedUserId);
        await tx.auditLog.create({
          data: {
            actorUserId,
            action:
              task.pendingActionType === "APPROVE"
                ? "ADMIN_APPROVE_SCORE"
                : "ADMIN_OVERRIDE_SCORE",
            targetType: "RatingTask",
            targetId: task.id,
            metadata: {
              ratedUserId: task.ratedUserId,
              ...(task.pendingActionType === "APPROVE"
                ? { finalScore }
                : { overriddenScore: finalScore }),
              revocationDelayed: true,
            },
          },
        });

        return profileState;
      });

      if (committed?.shouldNotifyCompletion && committed.finalScore !== null) {
        await notify.scoringComplete(task.ratedUserId, committed.finalScore);
      }
    } catch (err) {
      console.error(`[commitExpiredActions] failed for task ${task.id}:`, err);
    }
  }
}
