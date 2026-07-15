import type { Prisma } from "@prisma/client";
import { getChinaDutyWeekday, getOnDutyScorerIds } from "@/lib/scorer-duty";
import {
  getRatingTaskTimeline,
  getScoringTaskTimeline,
  type ScoringTaskTimeline,
} from "@/lib/scoring";
import {
  lockRatingUserTasks,
  syncRatingProfileFromTasks,
} from "@/lib/rating-profile-sync";

export interface RatingTaskQueueAssignment {
  timeline: ScoringTaskTimeline;
  scorerIds: string[];
}

export function parseRatingTaskPhotoKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value.filter((key): key is string => typeof key === "string" && key.length > 0)
    )
  );
}

export async function getRatingTaskQueueAssignment({
  ratedUserId,
  queuedAt,
  now = queuedAt,
}: {
  ratedUserId: string;
  queuedAt: Date;
  now?: Date;
}): Promise<RatingTaskQueueAssignment> {
  const timeline = getScoringTaskTimeline(queuedAt, now);

  const scorerIds = await getOnDutyScorerIds({
    excludeUserId: ratedUserId,
    weekday: getChinaDutyWeekday(timeline.publishAt),
  });

  return { timeline, scorerIds };
}

export async function enqueueRatingTaskPhotos(
  tx: Prisma.TransactionClient,
  {
    ratedUserId,
    photoObjectKeys,
    assignment,
    taskCreatedAt,
  }: {
    ratedUserId: string;
    photoObjectKeys: string[];
    assignment: RatingTaskQueueAssignment;
    taskCreatedAt: Date;
  }
) {
  await lockRatingUserTasks(tx, ratedUserId);

  const incomingKeys = parseRatingTaskPhotoKeys(photoObjectKeys);
  if (incomingKeys.length === 0) {
    throw new Error("At least one photo is required to enqueue a rating task");
  }

  let existingTask = await tx.ratingTask.findFirst({
    where: {
      ratedUserId,
      photoUploadBatchAt: assignment.timeline.publishAt,
    },
    orderBy: { createdAt: "desc" },
  });
  if (!existingTask) {
    const legacyTasks = await tx.ratingTask.findMany({
      where: { ratedUserId, photoUploadBatchAt: null },
      orderBy: { createdAt: "desc" },
    });
    const legacyTask = legacyTasks.find(
      (candidate) =>
        getRatingTaskTimeline(candidate, taskCreatedAt).publishAt.getTime() ===
        assignment.timeline.publishAt.getTime()
    );
    if (legacyTask) {
      const legacyPhotoKeys = parseRatingTaskPhotoKeys(legacyTask.photoObjectKeys);
      existingTask = await tx.ratingTask.update({
        where: { id: legacyTask.id },
        data: {
          photoObjectKeys:
            legacyPhotoKeys.length > 0 ? legacyPhotoKeys : [legacyTask.photoObjectKey],
          photoUploadBatchAt: assignment.timeline.publishAt,
          scoringPublishAt: assignment.timeline.publishAt,
        },
      });
    }
  }

  let task;
  let created = false;
  let reset = false;

  if (existingTask) {
    const existingKeys = parseRatingTaskPhotoKeys(existingTask.photoObjectKeys);
    const baseKeys =
      existingKeys.length > 0 ? existingKeys : [existingTask.photoObjectKey];
    const mergedKeys = Array.from(new Set([...baseKeys, ...incomingKeys]));
    const changed =
      mergedKeys.length !== baseKeys.length ||
      mergedKeys.some((key, index) => key !== baseKeys[index]);

    if (changed) {
      await tx.ratingScore.deleteMany({ where: { ratingTaskId: existingTask.id } });
      task = await tx.ratingTask.update({
        where: { id: existingTask.id },
        data: {
          photoObjectKey: mergedKeys[0],
          photoObjectKeys: mergedKeys,
          status: "PENDING",
          scorerSnapshot: assignment.scorerIds,
          scoringPublishAt: assignment.timeline.publishAt,
          publishedScore: null,
          revision: { increment: 1 },
          completedAt: null,
          photoReports: [],
          pendingActionType: null,
          pendingActionValue: null,
          pendingActionExpiresAt: null,
          pendingActionActorId: null,
        },
      });
      reset = true;
    } else {
      task = existingTask;
    }
  } else {
    task = await tx.ratingTask.create({
      data: {
        ratedUserId,
        photoObjectKey: incomingKeys[0],
        photoObjectKeys: incomingKeys,
        status: "PENDING",
        scorerSnapshot: assignment.scorerIds,
        scoringPublishAt: assignment.timeline.publishAt,
        photoUploadBatchAt: assignment.timeline.publishAt,
        createdAt: taskCreatedAt,
      },
    });
    created = true;
  }

  await syncRatingProfileFromTasks(tx, ratedUserId);

  return { task, created, reset };
}

export async function removePhotoFromRatingTasks(
  tx: Prisma.TransactionClient,
  {
    ratedUserId,
    storageKey,
  }: {
    ratedUserId: string;
    storageKey: string;
  }
): Promise<boolean> {
  await lockRatingUserTasks(tx, ratedUserId);

  const tasks = await tx.ratingTask.findMany({
    where: { ratedUserId, photoUploadBatchAt: { not: null } },
    orderBy: { createdAt: "desc" },
  });
  let changed = false;

  for (const task of tasks) {
    const existingKeys = parseRatingTaskPhotoKeys(task.photoObjectKeys);
    const baseKeys = existingKeys.length > 0 ? existingKeys : [task.photoObjectKey];
    if (!baseKeys.includes(storageKey)) continue;

    const remainingKeys = baseKeys.filter((key) => key !== storageKey);
    await tx.ratingScore.deleteMany({ where: { ratingTaskId: task.id } });

    if (remainingKeys.length === 0) {
      await tx.ratingTask.delete({ where: { id: task.id } });
    } else {
      await tx.ratingTask.update({
        where: { id: task.id },
        data: {
          photoObjectKey: remainingKeys[0],
          photoObjectKeys: remainingKeys,
          status: "PENDING",
          publishedScore: null,
          revision: { increment: 1 },
          completedAt: null,
          photoReports: [],
          pendingActionType: null,
          pendingActionValue: null,
          pendingActionExpiresAt: null,
          pendingActionActorId: null,
        },
      });
    }
    changed = true;
  }

  if (changed) {
    await syncRatingProfileFromTasks(tx, ratedUserId);
  }

  return changed;
}
