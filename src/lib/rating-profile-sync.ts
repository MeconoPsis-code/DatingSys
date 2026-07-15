import type { Prisma, RatingStatus, RatingTaskStatus } from "@prisma/client";

interface RatingTaskProfileStateInput {
  id?: string;
  status: RatingTaskStatus;
  publishedScore: number | null;
  scoringPublishAt?: Date | null;
  completedAt: Date | null;
  createdAt?: Date;
  updatedAt: Date;
}

export interface DerivedRatingProfileState {
  ratingStatus: RatingStatus;
  finalScore: number | null;
  scoreCompletedAt: Date | null;
}

const INCOMPLETE_STATUS_PRIORITY: Array<{
  taskStatuses: RatingTaskStatus[];
  ratingStatus: RatingStatus;
}> = [
  { taskStatuses: ["NEEDS_RESCORE"], ratingStatus: "NEEDS_RESCORE" },
  { taskStatuses: ["SCORING", "REPORTED"], ratingStatus: "SCORING" },
  { taskStatuses: ["PENDING"], ratingStatus: "PENDING" },
  { taskStatuses: ["REVIEW"], ratingStatus: "REVIEW" },
];

export function deriveRatingProfileState(
  tasks: RatingTaskProfileStateInput[]
): DerivedRatingProfileState {
  if (tasks.length === 0) {
    return {
      ratingStatus: "NOT_SUBMITTED",
      finalScore: null,
      scoreCompletedAt: null,
    };
  }

  for (const candidate of INCOMPLETE_STATUS_PRIORITY) {
    if (tasks.some((task) => candidate.taskStatuses.includes(task.status))) {
      return {
        ratingStatus: candidate.ratingStatus,
        finalScore: null,
        scoreCompletedAt: null,
      };
    }
  }

  const latestPublishedTask = tasks
    .filter((task) => task.status === "COMPLETED" && task.publishedScore !== null)
    .sort((left, right) => {
      const leftBatchTime = (left.scoringPublishAt ?? left.createdAt)?.getTime() ?? 0;
      const rightBatchTime = (right.scoringPublishAt ?? right.createdAt)?.getTime() ?? 0;
      if (leftBatchTime !== rightBatchTime) {
        return rightBatchTime - leftBatchTime;
      }
      const leftTime = (left.completedAt ?? left.updatedAt).getTime();
      const rightTime = (right.completedAt ?? right.updatedAt).getTime();
      if (leftTime !== rightTime) return rightTime - leftTime;
      return (right.id ?? "").localeCompare(left.id ?? "");
    })[0];

  return {
    ratingStatus: "COMPLETED",
    finalScore: latestPublishedTask?.publishedScore ?? null,
    scoreCompletedAt:
      latestPublishedTask?.completedAt ?? latestPublishedTask?.updatedAt ?? null,
  };
}

export async function lockRatingUserTasks(
  tx: Prisma.TransactionClient,
  ratedUserId: string
) {
  // PostgreSQL exposes advisory locks as a void-returning function. Prisma's
  // PostgreSQL adapter cannot deserialize `void`, so cast the result while
  // keeping the lock acquisition itself inside this transaction.
  await tx.$queryRaw<Array<{ lockResult: string }>>`
    SELECT pg_advisory_xact_lock(hashtext(${ratedUserId}))::text AS "lockResult"
  `;
}

export async function syncRatingProfileFromTasks(
  tx: Prisma.TransactionClient,
  ratedUserId: string
) {
  await lockRatingUserTasks(tx, ratedUserId);

  const tasks = await tx.ratingTask.findMany({
    where: { ratedUserId },
    select: {
      id: true,
      status: true,
      publishedScore: true,
      scoringPublishAt: true,
      completedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  const currentProfile = await tx.ratingProfile.findUnique({
    where: { userId: ratedUserId },
    select: {
      ratingStatus: true,
      finalScore: true,
      scoreCompletedAt: true,
    },
  });

  if (tasks.length === 0) {
    await tx.ratingProfile.deleteMany({ where: { userId: ratedUserId } });
    return {
      ...deriveRatingProfileState(tasks),
      shouldNotifyCompletion: false,
    };
  }

  const derived = deriveRatingProfileState(tasks);
  const finalScore =
    derived.ratingStatus === "COMPLETED"
      ? (derived.finalScore ?? currentProfile?.finalScore ?? null)
      : null;
  const scoreCompletedAt =
    derived.ratingStatus === "COMPLETED"
      ? (derived.scoreCompletedAt ?? currentProfile?.scoreCompletedAt ?? new Date())
      : null;
  const shouldNotifyCompletion =
    derived.ratingStatus === "COMPLETED" &&
    finalScore !== null &&
    (currentProfile?.ratingStatus !== "COMPLETED" ||
      currentProfile.finalScore !== finalScore);

  await tx.ratingProfile.upsert({
    where: { userId: ratedUserId },
    create: {
      userId: ratedUserId,
      ratingStatus: derived.ratingStatus,
      finalScore,
      scoreCompletedAt,
    },
    update: {
      ratingStatus: derived.ratingStatus,
      finalScore,
      scoreCompletedAt,
      ...(derived.ratingStatus === "COMPLETED"
        ? {}
        : {
            rankingOptIn: false,
            rankingOptInUpdatedAt: null,
          }),
    },
  });

  return {
    ratingStatus: derived.ratingStatus,
    finalScore,
    scoreCompletedAt,
    shouldNotifyCompletion,
  };
}
