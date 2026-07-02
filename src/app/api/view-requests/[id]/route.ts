import { requireAuth } from '@/lib/auth';
import { db } from '@/lib/db';
import { success, error } from '@/lib/api-response';
import { notify } from '@/lib/notifications';
import { getMaskedIdentity } from '@/lib/pseudonymous-identity';

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
      include: { requester: { select: { role: true } } },
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

    const respondedAt = new Date();

    // Update. If legacy opposite-direction pending rows exist, approve them
    // too so both request lists and match cards converge on the mutual state.
    const updated = await db.$transaction(async (tx) => {
      const handled = await tx.viewRequest.update({
        where: { id },
        data: {
          status: action === 'approve' ? 'APPROVED' : 'REJECTED',
          respondedAt,
        },
      });

      if (action === 'approve') {
        await tx.viewRequest.updateMany({
          where: {
            requesterId: viewRequest.targetUserId,
            targetUserId: viewRequest.requesterId,
            status: 'PENDING',
          },
          data: {
            status: 'APPROVED',
            respondedAt,
          },
        });
      }

      return handled;
    });

    // Notify the requester about the response
    const targetIdentity = await db.authIdentity.findFirst({
      where: { userId: session.id },
      select: { nickname: true },
    });
    const targetName =
      action === 'approve'
        ? targetIdentity?.nickname || "对方"
        : getMaskedIdentity(session.id).name;
    if (action === 'approve') {
      await notify.viewRequestApproved(viewRequest.requesterId, targetName);
    } else {
      await notify.viewRequestRejected(
        viewRequest.requesterId,
        targetName,
        viewRequest.requester.role === 'SUPER_ADMIN'
      );
    }

    return success(updated);
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err) throw err;
    return error('INTERNAL', '处理查看申请失败', 500);
  }
}
