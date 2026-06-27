import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { success, error } from '@/lib/api-response';
import { deleteFile } from '@/lib/storage';
import { notify } from '@/lib/notifications';
import { EDIT_COOLDOWN_DAYS } from '@/lib/validations/profile';
import {
  orderDraftPhotos,
  readProfileDraftData,
  toDraftJson,
} from '@/lib/profile-draft';
import { NextRequest } from 'next/server';

type PhotoReport = {
  reporterId?: unknown;
  reason?: unknown;
  createdAt?: unknown;
};

function getReportReasons(photoReports: unknown): string[] {
  if (!Array.isArray(photoReports)) return [];

  return photoReports
    .map((report: PhotoReport) =>
      typeof report.reason === 'string' ? report.reason.trim() : ''
    )
    .filter((reason) => reason.length > 0);
}

function summarizeReasons(reasons: string[]): string {
  const uniqueReasons = Array.from(new Set(reasons));
  return uniqueReasons.length > 0 ? uniqueReasons.join('；') : '照片内容异常';
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
    const session = await requireRole('SUPER_ADMIN');
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
      return error('NOT_FOUND', '任务不存在', 404);
    }

    const profile = task.ratedUser.profile;
    const photoStorageKeys = profile?.photos.map((photo) => photo.storageKey) ?? [];
    const revokedStorageKeys = new Set(photoStorageKeys);
    const reportReasons = getReportReasons(task.photoReports);
    const reasonSummary = summarizeReasons(reportReasons);
    const cooldownStartedAt = new Date();

    await db.$transaction(async (tx) => {
      await tx.profilePhoto.deleteMany({
        where: { profile: { userId: task.ratedUserId } },
      });

      await tx.ratingScore.deleteMany({
        where: { ratingTaskId: taskId },
      });

      await tx.ratingTask.delete({
        where: { id: taskId },
      });

      await tx.ratingProfile.deleteMany({
        where: { userId: task.ratedUserId },
      });

      await tx.matchSnapshot.deleteMany({
        where: {
          OR: [
            { userId: task.ratedUserId },
            { targetUserId: task.ratedUserId },
          ],
        },
      });

      if (profile) {
        const draftData = readProfileDraftData(profile.draftData);
        const draftPhotoUpdate =
          draftData.photos !== undefined
            ? {
                photos: orderDraftPhotos(
                  draftData.photos.filter((photo) => !revokedStorageKeys.has(photo.storageKey))
                ),
              }
            : null;
        const remainingDraftPhotos = draftPhotoUpdate?.photos ?? [];

        await tx.profile.update({
          where: { id: profile.id },
          data: {
            lastSubmittedAt: cooldownStartedAt,
            photoMatchPref: null,
            highScoreOnly: false,
            ...(draftPhotoUpdate
              ? {
                  draftData: toDraftJson({
                    ...draftData,
                    photos: remainingDraftPhotos,
                    deleteAllPhotos: remainingDraftPhotos.length === 0,
                  }),
                }
              : {}),
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorUserId: session.id,
          action: 'ADMIN_REVOKE_PHOTOS',
          targetType: 'RatingTask',
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

    await notify.photosRevoked(task.ratedUserId, reasonSummary, EDIT_COOLDOWN_DAYS);

    return success({
      message: '照片已撤销，用户已收到违规原因通知',
      revokedPhotoCount: photoStorageKeys.length,
      reason: reasonSummary,
    });
  } catch (err) {
    console.error('[admin/scoring/revoke-photos] error:', err);
    if (err && typeof err === 'object' && 'status' in err) {
      const appErr = err as { code: string; message: string; status: number };
      return error(appErr.code, appErr.message, appErr.status);
    }
    return error('INTERNAL_ERROR', '服务器内部错误', 500);
  }
}
