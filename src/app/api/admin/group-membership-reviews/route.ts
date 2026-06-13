import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { paginated, error } from '@/lib/api-response';
import { createLogger } from '@/lib/logger';

const log = createLogger('admin:group-reviews');

/**
 * GET /api/admin/group-membership-reviews
 *
 * List admin reviews for group membership anomalies (e.g. member left).
 * Supports filtering by status and standard pagination.
 *
 * Requires ADMIN+ role.
 */
export async function GET(req: NextRequest) {
  try {
    await requireRole('ADMIN');

    const { searchParams } = req.nextUrl;
    const status = searchParams.get('status') || 'pending';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)),
    );

    const where: Record<string, unknown> = {
      type: 'group_membership_left',
    };
    if (status !== 'all') {
      where.status = status;
    }

    const [reviews, total] = await Promise.all([
      db.adminReview.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.adminReview.count({ where }),
    ]);

    return paginated(reviews, total, page, pageSize);
  } catch (err) {
    log.error({ err }, 'Failed to list group membership reviews');
    if (err && typeof err === 'object' && 'status' in err) {
      const appErr = err as { code: string; message: string; status: number };
      return error(appErr.code, appErr.message, appErr.status);
    }
    return error('INTERNAL_ERROR', '服务器内部错误', 500);
  }
}
