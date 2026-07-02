import { db } from "@/lib/db";
import { readProfileDraftData } from "@/lib/profile-draft";
import { parseReportEvidenceKeys } from "@/lib/report-evidence";
import { deleteFile } from "@/lib/storage";

export interface DeletedUserSnapshot {
  id: string;
  qqNumber: string | null;
  role: string;
}

export interface FailedFileDelete {
  key: string;
  message: string;
}

export interface DeleteUsersPermanentlyOptions {
  actorId: string;
  userIds: string[];
  auditAction?: string;
  auditMetadata?: Record<string, unknown>;
}

export interface DeleteUsersPermanentlyResult {
  deletedCount: number;
  deletedUsers: DeletedUserSnapshot[];
  deletedFileKeys: string[];
  failedFileDeletes: FailedFileDelete[];
}

function uniqueNonEmpty(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

async function collectUserFileKeys(userIds: string[]): Promise<string[]> {
  const keySet = new Set<string>();

  const [profiles, ratingTasks, reports] = await Promise.all([
    db.profile.findMany({
      where: { userId: { in: userIds } },
      select: {
        draftData: true,
        photos: { select: { storageKey: true } },
      },
    }),
    db.ratingTask.findMany({
      where: { ratedUserId: { in: userIds } },
      select: { photoObjectKey: true },
    }),
    db.report.findMany({
      where: {
        OR: [
          { reporterId: { in: userIds } },
          { targetUserId: { in: userIds } },
        ],
      },
      select: { evidenceObjectKeys: true },
    }),
  ]);

  for (const profile of profiles) {
    for (const photo of profile.photos) {
      keySet.add(photo.storageKey);
    }

    const draftData = readProfileDraftData(profile.draftData);
    for (const photo of draftData.photos ?? []) {
      keySet.add(photo.storageKey);
    }
  }

  for (const task of ratingTasks) {
    keySet.add(task.photoObjectKey);
  }

  for (const report of reports) {
    for (const key of parseReportEvidenceKeys(report.evidenceObjectKeys)) {
      keySet.add(key);
    }
  }

  return [...keySet];
}

async function deleteCollectedFiles(keys: string[]): Promise<FailedFileDelete[]> {
  const results = await Promise.allSettled(
    keys.map(async (key) => {
      await deleteFile(key);
      return key;
    }),
  );

  return results.flatMap((result, index) => {
    if (result.status === "fulfilled") return [];
    const reason = result.reason;
    return [
      {
        key: keys[index],
        message: reason instanceof Error ? reason.message : "Unknown error",
      },
    ];
  });
}

export async function deleteUsersPermanently({
  actorId,
  userIds,
  auditAction = "ADMIN_DELETE_USER",
  auditMetadata,
}: DeleteUsersPermanentlyOptions): Promise<DeleteUsersPermanentlyResult> {
  const uniqueUserIds = uniqueNonEmpty(userIds);
  if (uniqueUserIds.length === 0) {
    return {
      deletedCount: 0,
      deletedUsers: [],
      deletedFileKeys: [],
      failedFileDeletes: [],
    };
  }

  const targets = await db.user.findMany({
    where: { id: { in: uniqueUserIds } },
    select: { id: true, qqNumber: true, role: true },
  });

  const qqNumbers = targets
    .map((target) => target.qqNumber)
    .filter((qqNumber): qqNumber is string => Boolean(qqNumber));
  const fileKeys = await collectUserFileKeys(uniqueUserIds);

  await db.$transaction(async (tx) => {
    await tx.ratingScore.deleteMany({
      where: { scorerUserId: { in: uniqueUserIds } },
    });
    await tx.ratingTask.deleteMany({
      where: { ratedUserId: { in: uniqueUserIds } },
    });
    await tx.matchSnapshot.deleteMany({
      where: {
        OR: [
          { userId: { in: uniqueUserIds } },
          { targetUserId: { in: uniqueUserIds } },
        ],
      },
    });
    await tx.viewRequest.deleteMany({
      where: {
        OR: [
          { requesterId: { in: uniqueUserIds } },
          { targetUserId: { in: uniqueUserIds } },
        ],
      },
    });
    await tx.report.deleteMany({
      where: {
        OR: [
          { reporterId: { in: uniqueUserIds } },
          { targetUserId: { in: uniqueUserIds } },
        ],
      },
    });
    await tx.penalty.deleteMany({
      where: {
        OR: [
          { userId: { in: uniqueUserIds } },
          { createdBy: { in: uniqueUserIds } },
        ],
      },
    });
    await tx.groupMembership.updateMany({
      where: { verifiedBy: { in: uniqueUserIds } },
      data: { verifiedBy: null },
    });
    await tx.groupMembership.updateMany({
      where: { revokedBy: { in: uniqueUserIds } },
      data: { revokedBy: null },
    });
    await tx.report.updateMany({
      where: { handledBy: { in: uniqueUserIds } },
      data: { handledBy: null },
    });
    await tx.adminReview.updateMany({
      where: { handledBy: { in: uniqueUserIds } },
      data: { handledBy: null },
    });
    await tx.adminReview.deleteMany({
      where: { userId: { in: uniqueUserIds } },
    });
    await tx.auditLog.deleteMany({
      where: {
        OR: [
          { actorUserId: { in: uniqueUserIds } },
          { targetType: "User", targetId: { in: uniqueUserIds } },
        ],
      },
    });
    await tx.botIdentity.deleteMany({
      where: {
        OR: [
          { userId: { in: uniqueUserIds } },
          ...(qqNumbers.length > 0 ? [{ qqNumber: { in: qqNumbers } }] : []),
        ],
      },
    });
    await tx.user.deleteMany({ where: { id: { in: uniqueUserIds } } });
  });

  const failedFileDeletes = await deleteCollectedFiles(fileKeys);

  try {
    await Promise.all(
      targets.map((target) =>
        db.auditLog.create({
          data: {
            actorUserId: actorId,
            action: auditAction,
            targetType: "User",
            targetId: target.id,
            metadata: {
              ...(auditMetadata ?? {}),
              qqNumber: target.qqNumber,
              role: target.role,
              deletedFiles: fileKeys.length - failedFileDeletes.length,
              failedFileDeletes: failedFileDeletes.length,
            },
          },
        }),
      ),
    );
  } catch (err) {
    console.error("[admin-user-delete] Failed to write delete audit log:", err);
  }

  return {
    deletedCount: targets.length,
    deletedUsers: targets,
    deletedFileKeys: fileKeys,
    failedFileDeletes,
  };
}
