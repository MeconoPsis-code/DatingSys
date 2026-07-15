import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { success, error } from "@/lib/api-response";
import { deleteFile } from "@/lib/storage";
import { notify } from "@/lib/notifications";
import { PHOTO_REVOKE_REPUBLISH_COOLDOWN_HOURS } from "@/lib/validations/profile";
import { orderDraftPhotos, readProfileDraftData, toDraftJson } from "@/lib/profile-draft";
import { NextRequest } from "next/server";
import {
  hasCurrentPublishedRatingTaskPhotos,
  parseRatingTaskPhotoKeys,
} from "@/lib/rating-task-queue";
import { lockRatingUserTasks } from "@/lib/rating-profile-sync";

type PhotoReport = {
  reporterId?: unknown;
  reason?: unknown;
  createdAt?: unknown;
};

function getReportReasons(photoReports: unknown): string[] {
  if (!Array.isArray(photoReports)) return [];

  return photoReports
    .map((report: PhotoReport) =>
      typeof report.reason === "string" ? report.reason.trim() : ""
    )
    .filter((reason) => reason.length > 0);
}

function summarizeReasons(reasons: string[]): string {
  const uniqueReasons = Array.from(new Set(reasons));
  return uniqueReasons.length > 0 ? uniqueReasons.join("；") : "照片内容异常";
}

/**
 * POST /api/admin/scoring/[taskId]/revoke-photos
 * Super admin confirms a photo report and removes the user's published photos.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const session = await requireRole("SUPER_ADMIN");
    const { taskId } = await params;

    const task = await db.ratingTask.findUnique({
      where: { id: taskId },
      include: {
        ratedUser: {
          include: {
            profile: { include: { photos: true } },
          },
        },
      },
    });

    if (!task) {
      return error("NOT_FOUND", "任务不存在", 404);
    }

    if (task.status !== "REPORTED") {
      return error("INVALID_STATUS", "只能撤销已被举报的照片任务", 409);
    }

    const profile = task.ratedUser.profile;
    const frozenTaskPhotoKeys = parseRatingTaskPhotoKeys(task.photoObjectKeys);
    const photoStorageKeys =
      frozenTaskPhotoKeys.length > 0
        ? frozenTaskPhotoKeys
        : (profile?.photos.map((photo) => photo.storageKey) ?? []);
    const revokedStorageKeys = new Set(photoStorageKeys);
    const reportReasons = getReportReasons(task.photoReports);
    const reasonSummary = summarizeReasons(reportReasons);
    const cooldownStartedAt = new Date();

    await db.$transaction(async (tx) => {
      await lockRatingUserTasks(tx, task.ratedUserId);
      const currentTask = await tx.ratingTask.findUnique({
        where: { id: taskId },
        select: {
          status: true,
          updatedAt: true,
          ratedUserId: true,
          photoObjectKey: true,
          photoObjectKeys: true,
        },
      });
      if (!currentTask || currentTask.updatedAt.getTime() !== task.updatedAt.getTime()) {
        throw {
          code: "CONFLICT",
          message: "评分任务已更新，请刷新后重试",
          status: 409,
        };
      }

      if (currentTask.status !== "REPORTED") {
        throw {
          code: "INVALID_STATUS",
          message: "只能撤销已被举报的照片任务",
          status: 409,
        };
      }
      if (!(await hasCurrentPublishedRatingTaskPhotos(tx, currentTask))) {
        throw {
          code: "STALE_PHOTO_TASK",
          message: "任务照片与用户当前已发布照片不一致，请刷新后重试",
          status: 409,
        };
      }

      await tx.profilePhoto.deleteMany({
        where: {
          profile: { userId: task.ratedUserId },
          storageKey: { in: photoStorageKeys },
        },
      });

      // The reported current snapshot is the complete published set. Once it
      // is revoked, no historical task remains scoreable. Delete all rating
      // state instead of reopening several older tasks with partial photos.
      await tx.ratingTask.deleteMany({ where: { ratedUserId: task.ratedUserId } });
      await tx.ratingProfile.deleteMany({ where: { userId: task.ratedUserId } });

      await tx.matchSnapshot.deleteMany({
        where: {
          OR: [{ userId: task.ratedUserId }, { targetUserId: task.ratedUserId }],
        },
      });

      const currentProfile = await tx.profile.findUnique({
        where: { userId: task.ratedUserId },
        select: { id: true, draftData: true },
      });
      if (currentProfile) {
        const draftData = readProfileDraftData(currentProfile.draftData);
        const draftPhotoUpdate =
          draftData.photos !== undefined
            ? {
                photos: orderDraftPhotos(
                  draftData.photos.filter(
                    (photo) => !revokedStorageKeys.has(photo.storageKey)
                  )
                ),
              }
            : null;
        const remainingDraftPhotos = draftPhotoUpdate?.photos ?? draftData.photos;
        const remainingPublishedPhotoCount = await tx.profilePhoto.count({
          where: { profileId: currentProfile.id },
        });

        await tx.profile.update({
          where: { id: currentProfile.id },
          data: {
            lastSubmittedAt: cooldownStartedAt,
            ...(remainingPublishedPhotoCount === 0
              ? {
                  photoMatchPref: null,
                  highScoreOnly: false,
                  matchPrefUpdatedAt: null,
                }
              : {}),
            draftData: toDraftJson({
              ...draftData,
              photoRevokedAt: cooldownStartedAt.toISOString(),
              ...(remainingDraftPhotos !== undefined
                ? {
                    photos: remainingDraftPhotos,
                    deleteAllPhotos: remainingDraftPhotos.length === 0,
                  }
                : {}),
            }),
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorUserId: session.id,
          action: "ADMIN_REVOKE_PHOTOS",
          targetType: "RatingTask",
          targetId: taskId,
          metadata: {
            ratedUserId: task.ratedUserId,
            revokedPhotoCount: photoStorageKeys.length,
            reasons: reportReasons,
          },
        },
      });
    });

    await Promise.all(photoStorageKeys.map((key) => deleteFile(key).catch(() => {})));

    await notify.photosRevoked(
      task.ratedUserId,
      reasonSummary,
      `${PHOTO_REVOKE_REPUBLISH_COOLDOWN_HOURS} 小时`,
      task.ratedUser.role === "SUPER_ADMIN"
    );

    return success({
      message: "照片已撤销，用户已收到违规原因通知",
      revokedPhotoCount: photoStorageKeys.length,
      reason: reasonSummary,
    });
  } catch (err) {
    console.error("[admin/scoring/revoke-photos] error:", err);
    if (err && typeof err === "object" && "status" in err) {
      const appErr = err as { code: string; message: string; status: number };
      return error(appErr.code, appErr.message, appErr.status);
    }
    return error("INTERNAL_ERROR", "服务器内部错误", 500);
  }
}
