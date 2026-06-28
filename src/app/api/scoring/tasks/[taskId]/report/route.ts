import { requireAuth } from '@/lib/auth';
import { db } from '@/lib/db';
import { success, error } from '@/lib/api-response';
import { NextRequest } from 'next/server';
import { can } from '@/lib/rbac';
import { isScorerOnDuty } from '@/lib/scorer-duty';

/**
 * POST /api/scoring/tasks/[taskId]/report
 * Scorer reports abnormal photos for a rating task.
 * Body: { reason: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const session = await requireAuth();
    if (!can(session.role, 'SCORE_PHOTO')) {
      return error('FORBIDDEN', '无权操作此任务', 403);
    }
    const { taskId } = await params;
    const body = await req.json();
    const reason = (body.reason as string)?.trim();

    if (!reason || reason.length < 2) {
      return error('INVALID_REASON', '请填写举报原因（至少2个字）', 400);
    }
    if (reason.length > 200) {
      return error('REASON_TOO_LONG', '举报原因不能超过200字', 400);
    }

    const task = await db.ratingTask.findUnique({ where: { id: taskId } });
    if (!task) {
      return error('NOT_FOUND', '任务不存在', 404);
    }

    if (!['PENDING', 'SCORING'].includes(task.status)) {
      return error('CONFLICT', '该任务当前不可举报', 409);
    }

    // Verify scorer is on today's live duty roster.
    const isOnDuty = await isScorerOnDuty({
      scorerId: session.id,
      excludeUserId: task.ratedUserId,
    });
    if (!isOnDuty) {
      return error('FORBIDDEN', '无权操作此任务', 403);
    }

    // Check for duplicate report
    const existing = (task.photoReports as Array<{ reporterId: string }>) || [];
    if (existing.some((r) => r.reporterId === session.id)) {
      return error('ALREADY_REPORTED', '你已经举报过此任务的照片', 400);
    }

    // Add report
    const newReport = {
      reporterId: session.id,
      reason,
      createdAt: new Date().toISOString(),
    };

    await db.ratingTask.update({
      where: { id: taskId },
      data: {
        photoReports: [...existing, newReport],
        status: 'REPORTED',
      },
    });

    return success({ message: '举报已提交，管理员将会审核' });
  } catch (err) {
    console.error('[scoring/report] error:', err);
    if (err && typeof err === 'object' && 'status' in err) {
      const appErr = err as { code: string; message: string; status: number };
      return error(appErr.code, appErr.message, appErr.status);
    }
    return error('INTERNAL_ERROR', '服务器内部错误', 500);
  }
}
