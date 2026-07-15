import { db } from "@/lib/db";
import { getChinaDutyWeekday, getOnDutyScorerIds } from "@/lib/scorer-duty";
import { getAssignedScorerIdsForTask, getRatingTaskTimeline } from "@/lib/scoring";
import {
  lockRatingUserTasks,
  syncRatingProfileFromTasks,
} from "@/lib/rating-profile-sync";

const DEADLINE_MANAGED_STATUSES = ["PENDING", "SCORING", "NEEDS_RESCORE"] as const;

export async function promoteExpiredScoringTasks(now = new Date()): Promise<number> {
  const tasks = await db.ratingTask.findMany({
    where: {
      status: { in: [...DEADLINE_MANAGED_STATUSES] },
    },
    include: {
      scores: { select: { scorerUserId: true } },
    },
  });

  const dutyCache = new Map<number, string[]>();
  let promotedCount = 0;

  for (const task of tasks) {
    const timeline = getRatingTaskTimeline(task, now);
    if (!timeline.isScoringClosed) continue;

    const dutyWeekday = getChinaDutyWeekday(timeline.publishAt);
    let onDutyScorerIds = dutyCache.get(dutyWeekday);

    if (!onDutyScorerIds) {
      onDutyScorerIds = await getOnDutyScorerIds({ weekday: dutyWeekday });
      dutyCache.set(dutyWeekday, onDutyScorerIds);
    }

    const assignedScorerIds = getAssignedScorerIdsForTask({
      status: task.status,
      ratedUserId: task.ratedUserId,
      scorerSnapshot: task.scorerSnapshot,
      onDutyScorerIds: onDutyScorerIds.filter((id) => id !== task.ratedUserId),
    });

    const promoted = await db.$transaction(async (tx) => {
      await lockRatingUserTasks(tx, task.ratedUserId);
      const updated = await tx.ratingTask.updateMany({
        where: {
          id: task.id,
          status: task.status,
          updatedAt: task.updatedAt,
        },
        data: {
          status: "REVIEW",
          completedAt: task.completedAt ?? timeline.scoringDeadlineAt,
          scorerSnapshot: assignedScorerIds,
        },
      });
      if (updated.count === 0) return false;

      await syncRatingProfileFromTasks(tx, task.ratedUserId);
      return true;
    });

    if (!promoted) continue;
    promotedCount++;
  }

  return promotedCount;
}
