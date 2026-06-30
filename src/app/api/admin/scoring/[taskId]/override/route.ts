import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { success, error } from '@/lib/api-response';
import { notify } from '@/lib/notifications';

/**
 * POST /api/admin/scoring/[taskId]/override
 * Super admin directly sets a custom final score, bypassing individual scorer scores.
 * Body: { score: number } — 0-10, step 0.1
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const session = await requireRole('SUPER_ADMIN');
    const { taskId } = await params;

    const body = await req.json();
    const { score } = body as { score?: number };

    if (score === undefined || score === null || typeof score !== 'number') {
      return error('VALIDATION', '请提供评分', 400);
    }

    if (score < 0 || score > 10 || score * 10 !== Math.round(score * 10)) {
      return error('VALIDATION', '评分必须在 0-10 之间，步长 0.1', 400);
    }

    const published = await db.$transaction(async (tx) => {
      const task = await tx.ratingTask.findUnique({ where: { id: taskId } });

      if (!task) {
        throw { code: 'NOT_FOUND', message: '评分任务不存在', status: 404 };
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
          finalScore: score,
          scoreCompletedAt: now,
        },
        update: {
          ratingStatus: 'COMPLETED',
          finalScore: score,
          scoreCompletedAt: now,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: session.id,
          action: 'ADMIN_OVERRIDE_SCORE',
          targetType: 'RatingTask',
          targetId: taskId,
          metadata: {
            ratedUserId: task.ratedUserId,
            overriddenScore: score,
            immediatePublish: true,
          },
        },
      });

      return { ratedUserId: task.ratedUserId };
    });

    await notify.scoringComplete(published.ratedUserId, score);

    return success({
      message: '最终评分已直接发布',
      finalScore: score,
    });
  } catch (err) {
    console.error('[admin/scoring/override] POST error:', err);
    if (err && typeof err === 'object' && 'status' in err) {
      const appErr = err as { code: string; message: string; status: number };
      return error(appErr.code, appErr.message, appErr.status);
    }
    return error('INTERNAL_ERROR', '服务器内部错误', 500);
  }
}
