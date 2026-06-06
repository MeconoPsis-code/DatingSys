import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { success, error, paginated } from '@/lib/api-response';

// ── GET /api/admin/memberships ──────────────────────────

export async function GET(req: Request) {
  try {
    await requireRole('ADMIN');

    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
    const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get('pageSize') || '20')));
    const status = url.searchParams.get('status') || undefined;
    const search = url.searchParams.get('search')?.trim() || undefined;

    // Build where clause
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (search) where.qqNumber = { contains: search };

    const [total, memberships] = await Promise.all([
      db.groupMembership.count({ where }),
      db.groupMembership.findMany({
        where,
        include: {
          user: {
            include: {
              authIdentities: { select: { nickname: true }, take: 1 },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const data = memberships.map((m) => ({
      id: m.id,
      userId: m.userId,
      qqNumber: m.qqNumber,
      groupId: m.groupId,
      status: m.status,
      verifiedAt: m.verifiedAt,
      expiresAt: m.expiresAt,
      revokedAt: m.revokedAt,
      remark: m.remark,
      createdAt: m.createdAt,
      nickname: m.user.authIdentities[0]?.nickname ?? null,
      userRole: m.user.role,
    }));

    return paginated(data, total, page, pageSize);
  } catch (err) {
    console.error('[admin/memberships] GET error:', err);
    if (err && typeof err === 'object' && 'status' in err) {
      const appErr = err as { code: string; message: string; status: number };
      return error(appErr.code, appErr.message, appErr.status);
    }
    return error('INTERNAL_ERROR', '服务器内部错误', 500);
  }
}

// ── POST /api/admin/memberships ─────────────────────────

export async function POST(req: Request) {
  try {
    const session = await requireRole('ADMIN');

    const body = await req.json();
    const { action, userId, remark, expiresInDays } = body as {
      action: string;
      userId: string;
      remark?: string;
      expiresInDays?: number;
    };

    const validActions = ['approve', 'reject', 'revoke'];
    if (!validActions.includes(action)) {
      return error('INVALID_ACTION', `无效操作: ${action}`, 400);
    }
    if (!userId) {
      return error('MISSING_USER_ID', '缺少用户ID', 400);
    }

    // Find membership
    const membership = await db.groupMembership.findUnique({
      where: { userId },
    });
    if (!membership) {
      return error('NOT_FOUND', '未找到该用户的群认证记录', 404);
    }

    // Execute action
    switch (action) {
      case 'approve': {
        const days = expiresInDays || 90;
        await db.groupMembership.update({
          where: { userId },
          data: {
            status: 'VERIFIED',
            verifiedAt: new Date(),
            verifiedBy: session.id,
            expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
            remark: remark || null,
          },
        });
        break;
      }

      case 'reject': {
        await db.groupMembership.update({
          where: { userId },
          data: {
            status: 'REJECTED',
            remark: remark || null,
          },
        });
        break;
      }

      case 'revoke': {
        await db.groupMembership.update({
          where: { userId },
          data: {
            status: 'REVOKED',
            revokedAt: new Date(),
            revokedBy: session.id,
            remark: remark || null,
          },
        });
        break;
      }
    }

    // Create audit log
    await db.auditLog.create({
      data: {
        actorUserId: session.id,
        action: `MEMBERSHIP_${action.toUpperCase()}`,
        targetType: 'GroupMembership',
        targetId: membership.id,
        metadata: { userId, remark: remark || null },
      },
    });

    const actionLabels: Record<string, string> = {
      approve: '认证已通过',
      reject: '认证已拒绝',
      revoke: '认证已撤销',
    };

    return success({ message: actionLabels[action] || '操作成功' });
  } catch (err) {
    console.error('[admin/memberships] POST error:', err);
    if (err && typeof err === 'object' && 'status' in err) {
      const appErr = err as { code: string; message: string; status: number };
      return error(appErr.code, appErr.message, appErr.status);
    }
    return error('INTERNAL_ERROR', '服务器内部错误', 500);
  }
}
