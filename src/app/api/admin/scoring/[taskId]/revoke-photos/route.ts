import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { success, error } from '@/lib/api-response';
import { NextRequest } from 'next/server';

/**
 * POST /api/admin/scoring/[taskId]/revoke-photos
 * Admin revokes user photos and resets the scoring task, prompting re-upload.
 * Deletes the user's photos, resets the rating task, and clears the rating profile.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    await requireRole('ADMIN');
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

    // Transaction: delete photos, reset task, reset rating profile
    await db.$transaction([
      // Delete all profile photos
      db.profilePhoto.deleteMany({
        where: { profile: { userId: task.ratedUserId } },
      }),
      // Delete all scores for this task
      db.ratingScore.deleteMany({
        where: { ratingTaskId: taskId },
      }),
      // Delete the rating task itself
      db.ratingTask.delete({
        where: { id: taskId },
      }),
      // Reset rating profile
      db.ratingProfile.updateMany({
        where: { userId: task.ratedUserId },
        data: {
          ratingStatus: 'NOT_SUBMITTED',
          finalScore: null,
          scoreCompletedAt: null,
        },
      }),
    ]);

    return success({ message: '照片已撤销，用户需要重新上传' });
  } catch (err) {
    console.error('[admin/scoring/revoke-photos] error:', err);
    if (err && typeof err === 'object' && 'status' in err) {
      const appErr = err as { code: string; message: string; status: number };
      return error(appErr.code, appErr.message, appErr.status);
    }
    return error('INTERNAL_ERROR', '服务器内部错误', 500);
  }
}
