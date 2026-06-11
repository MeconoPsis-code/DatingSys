import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { success, error } from '@/lib/api-response';

/**
 * POST /api/admin/scoring/[taskId]/override
 * Super admin directly sets a custom final score, bypassing individual scorer scores.
 * Body: { score: number } — 0-10, step 0.5
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

    if (score < 0 || score > 10 || score * 2 !== Math.round(score * 2)) {
      return error('VALIDATION', '评分必须在 0-10 之间，步长 0.5', 400);
    }

    const task = await db.ratingTask.findUnique({ where: { id: taskId } });

    if (!task) {
      return error('NOT_FOUND', '评分任务不存在', 404);
    }

    // Move task to COMPLETED
    await db.ratingTask.update({
      where: { id: taskId },
      data: {
        status: 'COMPLETED',
        completedAt: task.completedAt ?? new Date(),
      },
    });

    // Publish the overridden score
    await db.ratingProfile.upsert({
      where: { userId: task.ratedUserId },
      create: {
        userId: task.ratedUserId,
        ratingStatus: 'COMPLETED',
        finalScore: score,
        scoreCompletedAt: new Date(),
      },
      update: {
        ratingStatus: 'COMPLETED',
        finalScore: score,
        scoreCompletedAt: new Date(),
      },
    });

    // Audit log
    await db.auditLog.create({
      data: {
        actorUserId: session.id,
        action: 'ADMIN_OVERRIDE_SCORE',
        targetType: 'RatingTask',
        targetId: taskId,
        metadata: {
          ratedUserId: task.ratedUserId,
          overriddenScore: score,
        },
      },
    });

    return success({
      message: '已直接设定最终评分',
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
