import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { error } from '@/lib/api-response';
import { MembershipStatus } from '@prisma/client';
import { createLogger } from '@/lib/logger';
import { lockRatingUserTasks } from '@/lib/rating-profile-sync';
import { syncMembershipGroupCardsInTransaction } from '@/server/bot/group-card-sync.service';

const log = createLogger('admin:group-review-confirm-left');

/**
 * POST /api/admin/group-membership-reviews/[id]/confirm-left
 *
 * Confirm that a user has legitimately left the group.
 * Updates GroupMembership status to LEFT_CONFIRMED and resolves the AdminReview.
 *
 * Requires ADMIN+ role.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireRole('ADMIN');
    const { id } = await params;

    const review = await db.adminReview.findUnique({ where: { id } });
    if (!review || review.status !== 'pending') {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: '审核项不存在或已处理' } },
        { status: 404 },
      );
    }

    await db.$transaction(async (tx) => {
      if (review.userId) await lockRatingUserTasks(tx, review.userId);
    // Mark membership as confirmed left
    if (review.userId) {
      await tx.groupMembership.updateMany({
        where: {
          userId: review.userId,
          status: MembershipStatus.LEFT_PENDING_REVIEW,
        },
        data: {
          status: MembershipStatus.LEFT_CONFIRMED,
          leftConfirmedAt: new Date(),
          reviewedBy: session.id,
          reviewRemark: 'Admin confirmed left',
        },
      });
    }

    // Update review to resolved
    await tx.adminReview.update({
      where: { id },
      data: {
        status: 'resolved',
        resolution: 'confirmed_left',
        handledBy: session.id,
        handledAt: new Date(),
      },
    });


      if (review.userId) {
        const membership = await tx.groupMembership.findUnique({ where: { userId: review.userId }, select: { groupId: true, status: true } });
        const workspace = membership ? await tx.workspace.findUnique({ where: { qqGroupId: membership.groupId }, select: { id: true } }) : null;
        if (workspace) await tx.workspaceMember.updateMany({
          where: { workspaceId: workspace.id, userId: review.userId }, data: { leftAt: new Date() },
        });
        await syncMembershipGroupCardsInTransaction(tx, review.userId);
      }
    });

    await logAudit({
      actorId: session.id,
      action: 'MEMBERSHIP_EXPIRE',
      targetType: 'AdminReview',
      targetId: id,
      metadata: { userId: review.userId, resolution: 'confirmed_left' },
    });

    return NextResponse.json({ data: { success: true } });
  } catch (err) {
    log.error({ err }, 'Failed to confirm group membership left');
    if (err && typeof err === 'object' && 'status' in err) {
      const appErr = err as { code: string; message: string; status: number };
      return error(appErr.code, appErr.message, appErr.status);
    }
    return error('INTERNAL_ERROR', '服务器内部错误', 500);
  }
}
