import type { Prisma } from "@prisma/client";
import { getChinaDutyWeekday } from "@/lib/scorer-duty";
import {
  getRatingTaskTimeline,
  getScoringTaskTimeline,
  hasSamePhotoKeySet,
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

export async function hasCurrentPublishedRatingTaskPhotos(
  tx: Prisma.TransactionClient,
  task: {
    ratedUserId: string;
    photoObjectKey: string;
    photoObjectKeys: unknown;
  }
): Promise<boolean> {
  const frozenKeys = parseRatingTaskPhotoKeys(task.photoObjectKeys);
  const taskPhotoKeys = frozenKeys.length > 0 ? frozenKeys : [task.photoObjectKey];
  if (taskPhotoKeys.length === 0) return false;

  const profile = await tx.profile.findUnique({
    where: { userId: task.ratedUserId },
    select: {
      status: true,
      photos: { select: { storageKey: true } },
    },
  });
  if (profile?.status !== "ACTIVE") return false;

  return hasSamePhotoKeySet(
    taskPhotoKeys,
    profile.photos.map((photo) => photo.storageKey)
  );
}

/**
 * A formal publish supersedes every unfinished snapshot for the user. Completed
 * tasks remain as history; enqueueRatingTaskPhotos may still reset the task in
 * the same publish batch when its photo snapshot has changed.
 */
export async function discardUnfinishedRatingTasksForPublish(
  tx: Prisma.TransactionClient,
  ratedUserId: string
): Promise<number> {
  return discardOtherUnfinishedRatingTasks(tx, { ratedUserId });
}

export async function discardOtherUnfinishedRatingTasks(
  tx: Prisma.TransactionClient,
  {
    ratedUserId,
    exceptTaskId,
  }: {
    ratedUserId: string;
    exceptTaskId?: string;
  }
): Promise<number> {
  await lockRatingUserTasks(tx, ratedUserId);
  const result = await tx.ratingTask.deleteMany({
    where: {
      ratedUserId,
      status: { not: "COMPLETED" },
      ...(exceptTaskId ? { id: { not: exceptTaskId } } : {}),
    },
  });
  return result.count;
}

export async function getRatingTaskQueueAssignmentInTransaction(
  tx: Prisma.TransactionClient,
  {
    ratedUserId,
    queuedAt,
    now = queuedAt,
  }: {
    ratedUserId: string;
    queuedAt: Date;
    now?: Date;
  }
): Promise<RatingTaskQueueAssignment> {
  const timeline = getScoringTaskTimeline(queuedAt, now);

  const scorers = await tx.user.findMany({
    where: {
      id: { not: ratedUserId },
      role: { in: ["SCORER", "ADMIN"] },
      status: "ACTIVE",
      dutySchedules: {
        some: { weekday: getChinaDutyWeekday(timeline.publishAt) },
      },
    },
    select: { id: true },
  });

  return { timeline, scorerIds: scorers.map((scorer) => scorer.id) };
}

export async function enqueueRatingTaskPhotos(
  tx: Prisma.TransactionClient,
  {
    ratedUserId,
    photoObjectKeys,
    assignment,
    taskCreatedAt,
    forceReset = false,
  }: {
    ratedUserId: string;
    photoObjectKeys: string[];
    assignment: RatingTaskQueueAssignment;
    taskCreatedAt: Date;
    forceReset?: boolean;
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
    const changed =
      incomingKeys.length !== baseKeys.length ||
      incomingKeys.some((key, index) => key !== baseKeys[index]);

    if (changed || forceReset) {
      await tx.ratingScore.deleteMany({ where: { ratingTaskId: existingTask.id } });
      task = await tx.ratingTask.update({
        where: { id: existingTask.id },
        data: {
          photoObjectKey: incomingKeys[0],
          photoObjectKeys: incomingKeys,
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
    deleteContainingTasks = false,
    preserveCompletedScores = false,
  }: {
    ratedUserId: string;
    storageKey: string;
    deleteContainingTasks?: boolean;
    preserveCompletedScores?: boolean;
  }
): Promise<boolean> {
  await lockRatingUserTasks(tx, ratedUserId);

  const tasks = await tx.ratingTask.findMany({
    where: { ratedUserId },
    orderBy: { createdAt: "desc" },
  });
  let changed = false;

  for (const task of tasks) {
    const existingKeys = parseRatingTaskPhotoKeys(task.photoObjectKeys);
    const baseKeys = existingKeys.length > 0 ? existingKeys : [task.photoObjectKey];
    if (!baseKeys.includes(storageKey)) continue;

    // A task that ever contained an unpublished draft photo is invalid as a
    // whole. Deleting it is crucial: stripping the bad key and reopening the
    // remainder could turn several historical polluted tasks into several
    // simultaneously scoreable copies of the current photo set.
    if (deleteContainingTasks) {
      await tx.ratingTask.delete({ where: { id: task.id } });
      changed = true;
      continue;
    }

    const remainingKeys = baseKeys.filter((key) => key !== storageKey);

    // Legacy completed tasks predate upload-batch snapshots. A formal profile
    // publish can also preserve completed history while removing a withdrawn
    // object reference. Other unfinished tasks must be reset because their
    // displayed photo set changed before scoring was finalized.
    if (
      task.status === "COMPLETED" &&
      (task.photoUploadBatchAt === null || preserveCompletedScores)
    ) {
      if (remainingKeys.length === 0) {
        await tx.ratingTask.delete({ where: { id: task.id } });
      } else {
        await tx.ratingTask.update({
          where: { id: task.id },
          data: {
            photoObjectKey: remainingKeys[0],
            photoObjectKeys: remainingKeys,
            revision: { increment: 1 },
          },
        });
      }
      changed = true;
      continue;
    }

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
