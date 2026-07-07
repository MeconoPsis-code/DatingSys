import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { success, error } from "@/lib/api-response";
import { buildImageProxyUrl } from "@/lib/image-proxy";
import { getChinaDutyWeekday, getOnDutyScorerIds } from "@/lib/scorer-duty";
import {
  getAssignedScorerIdsForTask,
  getScoringTaskTimeline,
  SCOREABLE_TASK_STATUSES,
  serializeScoringTaskTimeline,
} from "@/lib/scoring";
import { promoteExpiredScoringTasks } from "@/lib/scoring-deadlines";

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
    await promoteExpiredScoringTasks();
    const now = new Date();

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

    const dutyCache = new Map<number, string[]>();
    const visibleTasks: Array<{
      task: (typeof tasks)[number];
      timeline: ReturnType<typeof getScoringTaskTimeline>;
      eligibleScorerIds: string[];
    }> = [];
    let nextAvailableAt: string | null = null;

    for (const task of tasks) {
      const timeline = getScoringTaskTimeline(task.createdAt, now);
      const dutyWeekday = getChinaDutyWeekday(timeline.publishAt);
      let onDutyScorerIds = dutyCache.get(dutyWeekday);

      if (!onDutyScorerIds) {
        onDutyScorerIds = await getOnDutyScorerIds({
          weekday: dutyWeekday,
        });
        dutyCache.set(dutyWeekday, onDutyScorerIds);
      }

      const eligibleScorerIds = getAssignedScorerIdsForTask({
        status: task.status,
        ratedUserId: task.ratedUserId,
        scorerSnapshot: task.scorerSnapshot,
        onDutyScorerIds,
      });

      if (!eligibleScorerIds.includes(session.id)) continue;

      if (!timeline.isReleasedForScoring) {
        const publishAt = timeline.publishAt.toISOString();
        if (
          timeline.publishAt.getTime() > now.getTime() &&
          (!nextAvailableAt || publishAt < nextAvailableAt)
        ) {
          nextAvailableAt = publishAt;
        }
        continue;
      }

      visibleTasks.push({ task, timeline, eligibleScorerIds });
    }

    // Enrich with photos + signed URLs
    const enriched = await Promise.all(
      visibleTasks.map(async ({ task, timeline, eligibleScorerIds }) => {
        const photos = await db.profilePhoto.findMany({
          where: {
            profile: { userId: task.ratedUserId },
          },
          orderBy: { order: "asc" },
        });

        const photosWithUrls = photos.map((p) => ({
          id: p.id,
          order: p.order,
          url: buildImageProxyUrl(p.storageKey, {
            viewerId: session.id,
            variant: "large",
          }),
        }));

        const eligibleScorerIdSet = new Set(eligibleScorerIds);
        const scoredCount = task.scores.filter((score) =>
          eligibleScorerIdSet.has(score.scorerUserId)
        ).length;
        const totalScorers = eligibleScorerIds.length;

        return {
          id: task.id,
          status: task.status,
          createdAt: task.createdAt,
          timeline: serializeScoringTaskTimeline(timeline),
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

    return success({ tasks: enriched, nextAvailableAt });
  }
}
