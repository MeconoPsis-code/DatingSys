import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { success, error } from '@/lib/api-response';
import { getOnDutyScorers } from '@/lib/scorer-duty';

// ── POST /api/admin/scoring/[taskId]/rescore — super admin rescore ──

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const session = await requireRole('SUPER_ADMIN');
    const { taskId } = await params;

    // Find the task
    const task = await db.ratingTask.findUnique({ where: { id: taskId } });
    if (!task) {
      return error('NOT_FOUND', '评分任务不存在', 404);
    }

    // Rebuild from today's on-duty roster, excluding the rated user.
    const scorers = await getOnDutyScorers({ excludeUserId: task.ratedUserId });
    const newScorerSnapshot = scorers.map((s) => s.id);

    // Transaction: delete scores, reset task, reset rating profile
    await db.$transaction([
      // 1. Delete all existing scores
      db.ratingScore.deleteMany({ where: { ratingTaskId: taskId } }),
      // 2. Reset task to PENDING with refreshed scorer snapshot
      db.ratingTask.update({
        where: { id: taskId },
        data: {
          status: 'PENDING',
          completedAt: null,
          scorerSnapshot: newScorerSnapshot,
        },
      }),
      // 3. Reset user's rating profile
      db.ratingProfile.updateMany({
        where: { userId: task.ratedUserId },
        data: {
          ratingStatus: 'PENDING',
          finalScore: null,
          scoreCompletedAt: null,
          rankingOptIn: false,
          rankingOptInUpdatedAt: null,
        },
      }),
    ]);

    // Audit log
    await db.auditLog.create({
      data: {
        actorUserId: session.id,
        action: 'ADMIN_RESCORE',
        targetType: 'RatingTask',
        targetId: taskId,
        metadata: {
          ratedUserId: task.ratedUserId,
          newScorerCount: newScorerSnapshot.length,
        },
      },
    });

    return success({
      message: '已重置评分，所有评分员将重新评分',
      scorerCount: newScorerSnapshot.length,
    });
  } catch (err) {
    console.error('[admin/scoring/rescore] POST error:', err);
    if (err && typeof err === 'object' && 'status' in err) {
      const appErr = err as { code: string; message: string; status: number };
      return error(appErr.code, appErr.message, appErr.status);
    }
    return error('INTERNAL_ERROR', '服务器内部错误', 500);
  }
}
