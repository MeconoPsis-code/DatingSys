import { db } from "@/lib/db";
import { getChinaDutyWeekday, getOnDutyScorerIds } from "@/lib/scorer-duty";
import { getAssignedScorerIdsForTask, getScoringTaskTimeline } from "@/lib/scoring";

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
    const timeline = getScoringTaskTimeline(task.createdAt, now);
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

    const updated = await db.ratingTask.updateMany({
      where: {
        id: task.id,
        status: task.status,
      },
      data: {
        status: "REVIEW",
        completedAt: task.completedAt ?? timeline.scoringDeadlineAt,
        scorerSnapshot: assignedScorerIds,
      },
    });

    if (updated.count === 0) continue;

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

    promotedCount++;
  }

  return promotedCount;
}
