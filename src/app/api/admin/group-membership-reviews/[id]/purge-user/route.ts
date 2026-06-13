import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { error } from '@/lib/api-response';
import { MembershipStatus } from '@prisma/client';
import { createLogger } from '@/lib/logger';

const log = createLogger('admin:group-review-purge');

/** Exact confirmation text required to proceed with purge */
const REQUIRED_CONFIRM_TEXT = '确认清除该用户在系统数据库中的全部记录';

/**
 * POST /api/admin/group-membership-reviews/[id]/purge-user
 *
 * Permanently purge all data for a user associated with a membership review.
 * This is a destructive, irreversible operation.
 *
 * Requires:
 * - ADMIN+ role
 * - Body must contain `confirmText` matching exactly: '确认清除该用户在系统数据库中的全部记录'
 *
 * Deletes (in a single transaction):
 * - Profile (with cascade-deleted ProfilePhotos)
 * - Preference
 * - RatingProfile
 * - MatchSnapshots (both directions)
 * - ViewRequests (both directions)
 * - User record
 *
 * Updates:
 * - AdminReview status to 'resolved' with resolution 'purged'
 * - GroupMembership status to REMOVED
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireRole('ADMIN');
    const { id } = await params;

    const body = await req.json();
    const { confirmText } = body;

    // Safety check: require exact confirmation text
    if (confirmText !== REQUIRED_CONFIRM_TEXT) {
      return NextResponse.json(
        {
          error: {
            code: 'CONFIRMATION_REQUIRED',
            message: '请输入正确的确认文本以执行清除操作',
          },
        },
        { status: 422 },
      );
    }

    const review = await db.adminReview.findUnique({ where: { id } });
    if (!review || review.status !== 'pending') {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: '审核项不存在或已处理' } },
        { status: 404 },
      );
    }

    if (!review.userId) {
      return NextResponse.json(
        { error: { code: 'NO_USER', message: '该审核项未关联用户' } },
        { status: 422 },
      );
    }

    const userId = review.userId;

    // Verify user exists
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, qqNumber: true },
    });
    if (!user) {
      return NextResponse.json(
        { error: { code: 'USER_NOT_FOUND', message: '用户不存在' } },
        { status: 404 },
      );
    }

    // Purge all user data in a single transaction
    await db.$transaction(async (tx) => {
      // Delete profile (cascade deletes ProfilePhotos via Prisma relation)
      await tx.profile.deleteMany({ where: { userId } });

      // Delete preference
      await tx.preference.deleteMany({ where: { userId } });

      // Delete rating profile
      await tx.ratingProfile.deleteMany({ where: { userId } });

      // Delete match snapshots (both as user and target)
      await tx.matchSnapshot.deleteMany({
        where: { OR: [{ userId }, { targetUserId: userId }] },
      });

      // Delete view requests (both as requester and target)
      await tx.viewRequest.deleteMany({
        where: { OR: [{ requesterId: userId }, { targetUserId: userId }] },
      });

      // Update group membership to REMOVED
      await tx.groupMembership.updateMany({
        where: { userId },
        data: {
          status: MembershipStatus.REMOVED,
          removedAt: new Date(),
          reviewedBy: session.id,
          reviewRemark: 'Admin purged user data',
        },
      });

      // Delete the user record itself
      await tx.user.delete({ where: { id: userId } });

      // Update review to resolved
      await tx.adminReview.update({
        where: { id },
        data: {
          status: 'resolved',
          resolution: 'purged',
          handledBy: session.id,
          handledAt: new Date(),
        },
      });
    });

    // Audit log (outside transaction — best-effort)
    await logAudit({
      actorId: session.id,
      action: 'PROFILE_CLEAR',
      targetType: 'User',
      targetId: userId,
      metadata: {
        reviewId: id,
        qqNumber: user.qqNumber,
        resolution: 'purged',
        purgedModels: [
          'Profile',
          'Preference',
          'RatingProfile',
          'MatchSnapshot',
          'ViewRequest',
          'GroupMembership',
          'User',
        ],
      },
    });

    log.info(
      { reviewId: id, userId, adminId: session.id },
      'User data purged successfully',
    );

    return NextResponse.json({ data: { success: true } });
  } catch (err) {
    log.error({ err }, 'Failed to purge user data');
    if (err && typeof err === 'object' && 'status' in err) {
      const appErr = err as { code: string; message: string; status: number };
      return error(appErr.code, appErr.message, appErr.status);
    }
    return error('INTERNAL_ERROR', '服务器内部错误', 500);
  }
}
