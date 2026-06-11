import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { success, error } from '@/lib/api-response';

/**
 * POST /api/admin/scoring/[taskId]/approve
 * Super admin approves a REVIEW score — publishes it to the user's RatingProfile.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const session = await requireRole('SUPER_ADMIN');
    const { taskId } = await params;

    const task = await db.ratingTask.findUnique({
      where: { id: taskId },
      include: { scores: { select: { score: true } } },
    });

    if (!task) {
      return error('NOT_FOUND', '评分任务不存在', 404);
    }

    if (task.status !== 'REVIEW') {
      return error('INVALID_STATUS', '该任务不在待审核状态', 400);
    }

    // Compute final average
    const avg =
      task.scores.reduce((sum, s) => sum + s.score, 0) / task.scores.length;
    const finalScore = Math.round(avg * 10) / 10;

    // Move task to COMPLETED
    await db.ratingTask.update({
      where: { id: taskId },
      data: { status: 'COMPLETED' },
    });

    // Publish score to RatingProfile
    await db.ratingProfile.upsert({
      where: { userId: task.ratedUserId },
      create: {
        userId: task.ratedUserId,
        ratingStatus: 'COMPLETED',
        finalScore,
        scoreCompletedAt: new Date(),
      },
      update: {
        ratingStatus: 'COMPLETED',
        finalScore,
        scoreCompletedAt: new Date(),
      },
    });

    // Audit log
    await db.auditLog.create({
      data: {
        actorUserId: session.id,
        action: 'ADMIN_APPROVE_SCORE',
        targetType: 'RatingTask',
        targetId: taskId,
        metadata: {
          ratedUserId: task.ratedUserId,
          finalScore,
        },
      },
    });

    return success({
      message: '评分已审核通过并发布',
      finalScore,
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
