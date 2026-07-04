import { db } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { calculateAverageScore } from "@/lib/scoring";

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

      // Safely perform double-check and status change with updateMany
      const updated = await db.ratingTask.updateMany({
        where: {
          id: task.id,
          status: "REVIEW",
          pendingActionExpiresAt: task.pendingActionExpiresAt,
        },
        data: {
          status: "COMPLETED",
          completedAt: now,
          pendingActionType: null,
          pendingActionValue: null,
          pendingActionExpiresAt: null,
          pendingActionActorId: null,
        },
      });

      // If count is 0, task was already processed or revoked
      if (updated.count === 0) {
        continue;
      }

      const actorUserId = task.pendingActionActorId || null;

      if (task.pendingActionType === "APPROVE") {
        const finalScore = approvedFinalScore as number;

        // Publish to user RatingProfile
        await db.ratingProfile.upsert({
          where: { userId: task.ratedUserId },
          create: {
            userId: task.ratedUserId,
            ratingStatus: "COMPLETED",
            finalScore,
            scoreCompletedAt: now,
          },
          update: {
            ratingStatus: "COMPLETED",
            finalScore,
            scoreCompletedAt: now,
          },
        });

        // Send completion notification
        await notify.scoringComplete(task.ratedUserId, finalScore);

        // Audit logging
        await db.auditLog.create({
          data: {
            actorUserId,
            action: "ADMIN_APPROVE_SCORE",
            targetType: "RatingTask",
            targetId: task.id,
            metadata: {
              ratedUserId: task.ratedUserId,
              finalScore,
              revocationDelayed: true,
            },
          },
        });
      } else if (task.pendingActionType === "OVERRIDE") {
        const score = task.pendingActionValue ?? 0;

        // Publish to user RatingProfile
        await db.ratingProfile.upsert({
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

        // Send completion notification
        await notify.scoringComplete(task.ratedUserId, score);

        // Audit logging
        await db.auditLog.create({
          data: {
            actorUserId,
            action: "ADMIN_OVERRIDE_SCORE",
            targetType: "RatingTask",
            targetId: task.id,
            metadata: {
              ratedUserId: task.ratedUserId,
              overriddenScore: score,
              revocationDelayed: true,
            },
          },
        });
      }
    } catch (err) {
      console.error(`[commitExpiredActions] failed for task ${task.id}:`, err);
    }
  }
}
