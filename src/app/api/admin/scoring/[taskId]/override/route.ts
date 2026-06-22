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

    const task = await db.ratingTask.findUnique({ where: { id: taskId } });

    if (!task) {
      return error('NOT_FOUND', '评分任务不存在', 404);
    }

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Save pending override action
    await db.ratingTask.update({
      where: { id: taskId },
      data: {
        pendingActionType: 'OVERRIDE',
        pendingActionValue: score,
        pendingActionExpiresAt: expiresAt,
        pendingActionActorId: session.id,
      },
    });

    return success({
      message: '直接设定评分已提交，将在 10 分钟后生效',
      finalScore: score,
      pendingActionExpiresAt: expiresAt.toISOString(),
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
