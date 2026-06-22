import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { success, error } from '@/lib/api-response';

/**
 * POST /api/admin/scoring/[taskId]/revoke
 * Super admin revokes a pending score approval or override decision.
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
    });

    if (!task) {
      return error('NOT_FOUND', '评分任务不存在', 404);
    }

    if (task.status !== 'REVIEW') {
      return error('INVALID_STATUS', '任务状态不正确', 400);
    }

    if (!task.pendingActionType) {
      return error('NO_PENDING_ACTION', '该任务没有待处理的审核决定', 400);
    }

    const previousActionType = task.pendingActionType;

    // Reset pending action fields
    await db.ratingTask.update({
      where: { id: taskId },
      data: {
        pendingActionType: null,
        pendingActionValue: null,
        pendingActionExpiresAt: null,
        pendingActionActorId: null,
      },
    });

    // Optional audit log for revocation
    await db.auditLog.create({
      data: {
        actorUserId: session.id,
        action: 'ADMIN_REVOKE_DECISION',
        targetType: 'RatingTask',
        targetId: taskId,
        metadata: {
          ratedUserId: task.ratedUserId,
          revokedActionType: previousActionType,
        },
      },
    });

    return success({
      message: '已成功撤销决定',
    });
  } catch (err) {
    console.error('[admin/scoring/revoke] POST error:', err);
    if (err && typeof err === 'object' && 'status' in err) {
      const appErr = err as { code: string; message: string; status: number };
      return error(appErr.code, appErr.message, appErr.status);
    }
    return error('INTERNAL_ERROR', '服务器内部错误', 500);
  }
}
