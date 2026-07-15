import type { RatingTaskStatus } from "@prisma/client";
import { db } from "../src/lib/db";
import { readProfileDraftData } from "../src/lib/profile-draft";
import {
  lockRatingUserTasks,
  syncRatingProfileFromTasks,
} from "../src/lib/rating-profile-sync";
import {
  discardUnfinishedRatingTasksForPublish,
  enqueueRatingTaskPhotos,
  getRatingTaskQueueAssignmentInTransaction,
  parseRatingTaskPhotoKeys,
  removePhotoFromRatingTasks,
} from "../src/lib/rating-task-queue";
import { hasSamePhotoKeySet } from "../src/lib/scoring";

const applyChanges = process.argv.includes("--apply");
const repairStartedAt = new Date();

interface RepairSummary {
  profilesScanned: number;
  usersWithoutProfile: number;
  draftUsersWithTasks: number;
  activeUsersWithoutPhotos: number;
  activeUsersWithUnpublishedKeys: number;
  activeUsersWithFragmentedTasks: number;
  activeUsersMissingFullSnapshot: number;
  affectedTasks: number;
  changedUsers: number;
  requeuedUsers: number;
}

interface RepairTask {
  id: string;
  status: RatingTaskStatus;
  photoObjectKey: string;
  photoObjectKeys: unknown;
}

function getUnpublishedDraftKeys(profile: {
  draftData: unknown;
  photos: Array<{ storageKey: string }>;
}): string[] {
  const publishedKeys = new Set(profile.photos.map((photo) => photo.storageKey));
  return Array.from(
    new Set(
      (readProfileDraftData(profile.draftData).photos ?? [])
        .filter(
          (photo) => photo.source === "draft" && !publishedKeys.has(photo.storageKey)
        )
        .map((photo) => photo.storageKey)
    )
  );
}

function getTaskPhotoKeys(task: RepairTask): string[] {
  const frozenKeys = parseRatingTaskPhotoKeys(task.photoObjectKeys);
  return frozenKeys.length > 0 ? frozenKeys : [task.photoObjectKey];
}

function analyzeActiveTasks(
  publishedKeys: string[],
  unpublishedDraftKeys: string[],
  tasks: RepairTask[]
) {
  const unpublishedKeySet = new Set(unpublishedDraftKeys);
  const contaminatedTasks = tasks.filter((task) =>
    getTaskPhotoKeys(task).some((key) => unpublishedKeySet.has(key))
  );
  const exactTasks = tasks.filter((task) =>
    hasSamePhotoKeySet(getTaskPhotoKeys(task), publishedKeys)
  );
  const unfinishedTasks = tasks.filter((task) => task.status !== "COMPLETED");
  const fragmentedUnfinishedTasks = unfinishedTasks.filter(
    (task) => !hasSamePhotoKeySet(getTaskPhotoKeys(task), publishedKeys)
  );

  return {
    contaminatedTasks,
    exactTasks,
    unfinishedTasks,
    hasExactCompletedTask: exactTasks.some((task) => task.status === "COMPLETED"),
    needsUnfinishedConsolidation:
      unfinishedTasks.length > 1 || fragmentedUnfinishedTasks.length > 0,
    missingFullSnapshot: publishedKeys.length > 0 && exactTasks.length === 0,
  };
}

async function assertRepairSchemaReady() {
  try {
    // Run before any per-user transaction so --apply can never partially
    // mutate an installation whose rating-task migration is not deployed.
    await db.ratingTask.findFirst({
      select: {
        photoObjectKeys: true,
        photoUploadBatchAt: true,
        scoringPublishAt: true,
        publishedScore: true,
        revision: true,
      },
    });
  } catch (error) {
    const errorCode =
      error && typeof error === "object" && "code" in error ? String(error.code) : null;
    if (errorCode === "P2022") {
      throw new Error(
        "The rating-task batch migration is not deployed. Run the database migrations before this repair command."
      );
    }
    throw error;
  }
}

async function main() {
  if (process.argv.includes("--help")) {
    console.log(
      "Usage: npm run repair:unpublished-rating-tasks -- [--apply]\n" +
        "Runs as a dry-run unless --apply is provided."
    );
    return;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not configured. Refusing to run the repair command."
    );
  }

  await assertRepairSchemaReady();

  const profiles = await db.profile.findMany({
    select: {
      userId: true,
      status: true,
      draftData: true,
      photos: { orderBy: { order: "asc" }, select: { storageKey: true } },
    },
  });

  const summary: RepairSummary = {
    profilesScanned: profiles.length,
    usersWithoutProfile: 0,
    draftUsersWithTasks: 0,
    activeUsersWithoutPhotos: 0,
    activeUsersWithUnpublishedKeys: 0,
    activeUsersWithFragmentedTasks: 0,
    activeUsersMissingFullSnapshot: 0,
    affectedTasks: 0,
    changedUsers: 0,
    requeuedUsers: 0,
  };

  const profileUserIds = new Set(profiles.map((profile) => profile.userId));
  const ratedTaskUsers = await db.ratingTask.findMany({
    distinct: ["ratedUserId"],
    select: { ratedUserId: true },
  });
  const usersWithoutProfile = ratedTaskUsers
    .map((task) => task.ratedUserId)
    .filter((userId) => !profileUserIds.has(userId));

  for (const userId of usersWithoutProfile) {
    const taskCount = await db.ratingTask.count({ where: { ratedUserId: userId } });
    if (taskCount === 0) continue;
    summary.usersWithoutProfile++;
    summary.affectedTasks += taskCount;
    if (!applyChanges) continue;

    const changed = await db.$transaction(async (tx) => {
      await lockRatingUserTasks(tx, userId);
      const currentProfile = await tx.profile.findUnique({
        where: { userId },
        select: { id: true },
      });
      if (currentProfile) return false;
      const deleted = await tx.ratingTask.deleteMany({ where: { ratedUserId: userId } });
      await tx.ratingProfile.deleteMany({ where: { userId } });
      return deleted.count > 0;
    });
    if (changed) summary.changedUsers++;
  }

  for (const profile of profiles) {
    if (profile.status !== "DRAFT" && profile.status !== "ACTIVE") continue;

    const tasks = await db.ratingTask.findMany({
      where: { ratedUserId: profile.userId },
      select: {
        id: true,
        status: true,
        photoObjectKey: true,
        photoObjectKeys: true,
      },
    });
    if (profile.status === "DRAFT") {
      if (tasks.length === 0) continue;
      summary.draftUsersWithTasks++;
      summary.affectedTasks += tasks.length;
      if (!applyChanges) continue;

      const changed = await db.$transaction(async (tx) => {
        await lockRatingUserTasks(tx, profile.userId);
        const currentProfile = await tx.profile.findUnique({
          where: { userId: profile.userId },
          select: { status: true },
        });
        if (currentProfile?.status !== "DRAFT") return false;

        const deleted = await tx.ratingTask.deleteMany({
          where: { ratedUserId: profile.userId },
        });
        await tx.ratingProfile.deleteMany({ where: { userId: profile.userId } });
        return deleted.count > 0;
      });
      if (changed) summary.changedUsers++;
      continue;
    }

    const publishedKeys = profile.photos.map((photo) => photo.storageKey);
    if (publishedKeys.length === 0) {
      if (tasks.length === 0) continue;
      summary.activeUsersWithoutPhotos++;
      summary.affectedTasks += tasks.length;
      if (!applyChanges) continue;

      const changed = await db.$transaction(async (tx) => {
        await lockRatingUserTasks(tx, profile.userId);
        const currentProfile = await tx.profile.findUnique({
          where: { userId: profile.userId },
          select: {
            status: true,
            photos: { select: { id: true } },
          },
        });
        if (currentProfile?.status !== "ACTIVE" || currentProfile.photos.length > 0) {
          return false;
        }
        const deleted = await tx.ratingTask.deleteMany({
          where: { ratedUserId: profile.userId },
        });
        await tx.ratingProfile.deleteMany({ where: { userId: profile.userId } });
        return deleted.count > 0;
      });
      if (changed) summary.changedUsers++;
      continue;
    }

    const unpublishedDraftKeys = getUnpublishedDraftKeys(profile);
    const analysis = analyzeActiveTasks(publishedKeys, unpublishedDraftKeys, tasks);
    const needsRepair =
      analysis.contaminatedTasks.length > 0 ||
      analysis.needsUnfinishedConsolidation ||
      analysis.missingFullSnapshot;
    if (!needsRepair) continue;

    if (analysis.contaminatedTasks.length > 0) {
      summary.activeUsersWithUnpublishedKeys++;
    }
    if (analysis.needsUnfinishedConsolidation) {
      summary.activeUsersWithFragmentedTasks++;
    }
    if (analysis.missingFullSnapshot) {
      summary.activeUsersMissingFullSnapshot++;
    }
    const affectedTaskIds = new Set([
      ...analysis.contaminatedTasks.map((task) => task.id),
      ...(analysis.needsUnfinishedConsolidation
        ? analysis.unfinishedTasks.map((task) => task.id)
        : []),
      ...(analysis.missingFullSnapshot ? tasks.map((task) => task.id) : []),
    ]);
    summary.affectedTasks += affectedTaskIds.size;
    if (!applyChanges) continue;

    const result = await db.$transaction(async (tx) => {
      await lockRatingUserTasks(tx, profile.userId);
      const currentProfile = await tx.profile.findUnique({
        where: { userId: profile.userId },
        select: {
          status: true,
          draftData: true,
          photos: {
            orderBy: { order: "asc" },
            select: { storageKey: true },
          },
        },
      });
      if (!currentProfile || currentProfile.status !== "ACTIVE") {
        return { changed: false, requeued: false };
      }

      const currentPublishedKeys = currentProfile.photos.map((photo) => photo.storageKey);
      if (currentPublishedKeys.length === 0) {
        const deleted = await tx.ratingTask.deleteMany({
          where: { ratedUserId: profile.userId },
        });
        await tx.ratingProfile.deleteMany({ where: { userId: profile.userId } });
        return { changed: deleted.count > 0, requeued: false };
      }

      let removedContamination = false;
      for (const storageKey of getUnpublishedDraftKeys(currentProfile)) {
        removedContamination =
          (await removePhotoFromRatingTasks(tx, {
            ratedUserId: profile.userId,
            storageKey,
            deleteContainingTasks: true,
          })) || removedContamination;
      }

      const currentTasks = await tx.ratingTask.findMany({
        where: { ratedUserId: profile.userId },
        select: {
          id: true,
          status: true,
          photoObjectKey: true,
          photoObjectKeys: true,
        },
      });
      const currentAnalysis = analyzeActiveTasks(currentPublishedKeys, [], currentTasks);
      const mustConsolidate =
        removedContamination ||
        currentAnalysis.needsUnfinishedConsolidation ||
        currentAnalysis.missingFullSnapshot;
      if (!mustConsolidate) {
        return { changed: removedContamination, requeued: false };
      }

      const discardedCount = await discardUnfinishedRatingTasksForPublish(
        tx,
        profile.userId
      );
      const shouldRequeue = !currentAnalysis.hasExactCompletedTask;

      if (shouldRequeue) {
        // Repair time is intentionally the new queue time. Reusing an old
        // lastSubmittedAt could create a task whose scoring window is already
        // closed before any scorer can see it.
        const assignment = await getRatingTaskQueueAssignmentInTransaction(tx, {
          ratedUserId: profile.userId,
          queuedAt: repairStartedAt,
          now: repairStartedAt,
        });
        await enqueueRatingTaskPhotos(tx, {
          ratedUserId: profile.userId,
          photoObjectKeys: currentPublishedKeys,
          assignment,
          taskCreatedAt: repairStartedAt,
          forceReset: true,
        });
        return { changed: true, requeued: true };
      }

      if (removedContamination || discardedCount > 0) {
        await syncRatingProfileFromTasks(tx, profile.userId);
      }
      return {
        changed: removedContamination || discardedCount > 0,
        requeued: false,
      };
    });
    if (result.changed) summary.changedUsers++;
    if (result.requeued) summary.requeuedUsers++;
  }

  console.log(
    JSON.stringify(
      {
        mode: applyChanges ? "apply" : "dry-run",
        ...summary,
      },
      null,
      2
    )
  );
  if (
    !applyChanges &&
    (summary.affectedTasks > 0 || summary.activeUsersMissingFullSnapshot > 0)
  ) {
    console.log("Dry run only. Re-run with --apply to repair these tasks.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
