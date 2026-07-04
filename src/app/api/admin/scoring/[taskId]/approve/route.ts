import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { success, error } from '@/lib/api-response';
import { calculateAverageScore } from '@/lib/scoring';
import { SCORE_ACTION_REVOCATION_WINDOW_MS } from '@/lib/scoring-revocation';

/**
 * POST /api/admin/scoring/[taskId]/approve
 * Super admin schedules the current live average for publishing after the revocation window.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const session = await requireRole('SUPER_ADMIN');
    const { taskId } = await params;

    const scheduled = await db.$transaction(async (tx) => {
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
      const expiresAt = new Date(now.getTime() + SCORE_ACTION_REVOCATION_WINDOW_MS);

      await tx.ratingTask.update({
        where: { id: taskId },
        data: {
          status: 'REVIEW',
          completedAt: task.completedAt ?? now,
          pendingActionType: 'APPROVE',
          pendingActionValue: null,
          pendingActionExpiresAt: expiresAt,
          pendingActionActorId: session.id,
        },
      });

      await tx.ratingProfile.upsert({
        where: { userId: task.ratedUserId },
        create: {
          userId: task.ratedUserId,
          ratingStatus: 'REVIEW',
        },
        update: {
          ratingStatus: 'REVIEW',
          finalScore: null,
          scoreCompletedAt: null,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: session.id,
          action: 'ADMIN_APPROVE_SCORE_PENDING',
          targetType: 'RatingTask',
          targetId: taskId,
          metadata: {
            ratedUserId: task.ratedUserId,
            finalScore,
            scoredCount: task.scores.length,
            pendingActionExpiresAt: expiresAt.toISOString(),
            revocationWindowMinutes: SCORE_ACTION_REVOCATION_WINDOW_MS / 60000,
          },
        },
      });

      return {
        finalScore,
        pendingActionExpiresAt: expiresAt.toISOString(),
      };
    });

    return success({
      message: '评分审核通过已提交，将在 5 分钟后生效',
      finalScore: scheduled.finalScore,
      pendingActionExpiresAt: scheduled.pendingActionExpiresAt,
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
