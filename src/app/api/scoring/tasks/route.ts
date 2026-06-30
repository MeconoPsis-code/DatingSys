import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getSignedUrl } from "@/lib/storage";
import { success, error } from "@/lib/api-response";
import { getOnDutyScorerIds } from "@/lib/scorer-duty";
import { getAssignedScorerIdsForTask, SCOREABLE_TASK_STATUSES } from "@/lib/scoring";

/**
 * GET /api/scoring/tasks
 *
 * List rating tasks for the current scorer.
 * Query params:
 *   - status: "pending" (default) | "completed"
 */
export async function GET(req: Request) {
  const session = await requireAuth();

  if (!can(session.role, "SCORE_PHOTO")) {
    return error("FORBIDDEN", "无权访问评分功能", 403);
  }

  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get("status") || "pending";

  if (statusFilter !== "pending") {
    return error("VALIDATION_ERROR", "无权访问评分历史记录", 403);
  }

  if (statusFilter === "pending") {
    const onDutyScorerIds = await getOnDutyScorerIds();

    // Tasks not yet scored by this user
    const tasks = await db.ratingTask.findMany({
      where: {
        status: { in: [...SCOREABLE_TASK_STATUSES] },
        // Exclude scorer's own profile
        ratedUserId: { not: session.id },
        scores: {
          none: { scorerUserId: session.id },
        },
      },
      include: {
        ratedUser: {
          include: {
            profile: {
              select: {
                birthDate: true,
                heightCm: true,
                weightKg: true,
                attribute: true,
                customAttribute: true,
              },
            },
          },
        },
        scores: {
          select: { id: true, scorerUserId: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const visibleTasks = tasks.filter((task) => {
      const eligibleScorerIds = getAssignedScorerIdsForTask({
        status: task.status,
        ratedUserId: task.ratedUserId,
        scorerSnapshot: task.scorerSnapshot,
        onDutyScorerIds,
      });
      return eligibleScorerIds.includes(session.id);
    });

    // Enrich with photos + signed URLs
    const enriched = await Promise.all(
      visibleTasks.map(async (task) => {
        const photos = await db.profilePhoto.findMany({
          where: {
            profile: { userId: task.ratedUserId },
          },
          orderBy: { order: "asc" },
        });

        const photosWithUrls = await Promise.all(
          photos.map(async (p) => ({
            id: p.id,
            order: p.order,
            url: await getSignedUrl(p.storageKey, 3600),
          }))
        );

        const eligibleScorerIds = getAssignedScorerIdsForTask({
          status: task.status,
          ratedUserId: task.ratedUserId,
          scorerSnapshot: task.scorerSnapshot,
          onDutyScorerIds,
        });
        const eligibleScorerIdSet = new Set(eligibleScorerIds);
        const scoredCount = task.scores.filter((score) =>
          eligibleScorerIdSet.has(score.scorerUserId)
        ).length;
        const totalScorers = eligibleScorerIds.length;

        return {
          id: task.id,
          status: task.status,
          createdAt: task.createdAt,
          progress: { scored: scoredCount, total: totalScorers },
          profile: task.ratedUser.profile
            ? {
                birthDate: task.ratedUser.profile.birthDate,
                heightCm: task.ratedUser.profile.heightCm,
                weightKg: task.ratedUser.profile.weightKg,
                attribute: task.ratedUser.profile.attribute,
                customAttribute: task.ratedUser.profile.customAttribute,
              }
            : null,
          photos: photosWithUrls,
        };
      })
    );

    return success({ tasks: enriched });
  }
}
