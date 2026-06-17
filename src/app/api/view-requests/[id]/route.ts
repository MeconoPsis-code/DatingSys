import { requireAuth } from '@/lib/auth';
import { db } from '@/lib/db';
import { success, error } from '@/lib/api-response';
import { notify } from '@/lib/notifications';

/**
 * PUT /api/view-requests/[id] — Approve or reject a view request
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await req.json();
    const { action } = body;

    // Validate action
    if (!action || !['approve', 'reject'].includes(action)) {
      return error('VALIDATION', 'action 必须为 approve 或 reject', 400);
    }

    // Find the ViewRequest by id
    const viewRequest = await db.viewRequest.findUnique({
      where: { id },
    });

    if (!viewRequest) {
      return error('NOT_FOUND', '查看申请不存在', 404);
    }

    // Verify current user is the target
    if (viewRequest.targetUserId !== session.id) {
      return error('FORBIDDEN', '只有目标用户可以处理此申请', 403);
    }

    // Verify status is PENDING
    if (viewRequest.status !== 'PENDING') {
      return error('INVALID_STATUS', '该申请已被处理', 400);
    }

    // Update
    const updated = await db.viewRequest.update({
      where: { id },
      data: {
        status: action === 'approve' ? 'APPROVED' : 'REJECTED',
        respondedAt: new Date(),
      },
    });

    // Notify the requester about the response
    const targetIdentity = await db.authIdentity.findFirst({
      where: { userId: session.id },
      select: { nickname: true },
    });
    const targetName = targetIdentity?.nickname || "对方";
    if (action === 'approve') {
      await notify.viewRequestApproved(viewRequest.requesterId, targetName);
    } else {
      await notify.viewRequestRejected(viewRequest.requesterId, targetName);
    }

    return success(updated);
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err) throw err;
    return error('INTERNAL', '处理查看申请失败', 500);
  }
}
