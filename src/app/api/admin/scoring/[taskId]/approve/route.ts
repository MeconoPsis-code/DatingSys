import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { success, error } from '@/lib/api-response';
import { notify } from '@/lib/notifications';
import { calculateAverageScore } from '@/lib/scoring';

/**
 * POST /api/admin/scoring/[taskId]/approve
 * Super admin publishes the current live average to the user's RatingProfile.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const session = await requireRole('SUPER_ADMIN');
    const { taskId } = await params;

    const published = await db.$transaction(async (tx) => {
      const task = await tx.ratingTask.findUnique({
        where: { id: taskId },
        include: { scores: { select: { score: true } } },
      });

      if (!task) {
        throw { code: 'NOT_FOUND', message: '评分任务不存在', status: 404 };
      }

      if (!['PENDING', 'SCORING', 'NEEDS_RESCORE', 'REVIEW'].includes(task.status)) {
        throw { code: 'INVALID_STATUS', message: '该任务当前不可发布评分', status: 400 };
      }

      const finalScore = calculateAverageScore(task.scores);
      if (finalScore === null) {
        throw { code: 'NO_SCORES', message: '当前还没有评分，无法发布最终分数', status: 400 };
      }

      const now = new Date();

      await tx.ratingTask.update({
        where: { id: taskId },
        data: {
          status: 'COMPLETED',
          completedAt: now,
          pendingActionType: null,
          pendingActionValue: null,
          pendingActionExpiresAt: null,
          pendingActionActorId: null,
        },
      });

      await tx.ratingProfile.upsert({
        where: { userId: task.ratedUserId },
        create: {
          userId: task.ratedUserId,
          ratingStatus: 'COMPLETED',
          finalScore,
          scoreCompletedAt: now,
        },
        update: {
          ratingStatus: 'COMPLETED',
          finalScore,
          scoreCompletedAt: now,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: session.id,
          action: 'ADMIN_APPROVE_SCORE',
          targetType: 'RatingTask',
          targetId: taskId,
          metadata: {
            ratedUserId: task.ratedUserId,
            finalScore,
            scoredCount: task.scores.length,
            immediatePublish: true,
          },
        },
      });

      return {
        ratedUserId: task.ratedUserId,
        finalScore,
      };
    });

    await notify.scoringComplete(published.ratedUserId, published.finalScore);

    return success({
      message: '已发布当前实时评分',
      finalScore: published.finalScore,
    });
  } catch (err) {
    console.error('[admin/scoring/approve] POST error:', err);
    if (err && typeof err === 'object' && 'status' in err) {
      const appErr = err as { code: string; message: string; status: number };
      return error(appErr.code, appErr.message, appErr.status);
    }
    return error('INTERNAL_ERROR', '服务器内部错误', 500);
  }
}
