import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { error, paginated } from '@/lib/api-response';

// ── GET /api/admin/audit-logs — paginated, filterable ──

export async function GET(req: Request) {
  try {
    await requireRole('ADMIN');

    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
    const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get('pageSize') || '30')));
    const action = url.searchParams.get('action') || undefined;
    const actorUserId = url.searchParams.get('actorUserId') || undefined;
    const targetType = url.searchParams.get('targetType') || undefined;
    const dateFrom = url.searchParams.get('dateFrom') || undefined;
    const dateTo = url.searchParams.get('dateTo') || undefined;

    // Build where clause
    const where: Record<string, unknown> = {};
    if (action) where.action = { contains: action };
    if (actorUserId) where.actorUserId = actorUserId;
    if (targetType) where.targetType = targetType;

    // Date range
    if (dateFrom || dateTo) {
      const createdAt: Record<string, Date> = {};
      if (dateFrom) createdAt.gte = new Date(dateFrom);
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        createdAt.lte = to;
      }
      where.createdAt = createdAt;
    }

    const [total, logs] = await Promise.all([
      db.auditLog.count({ where }),
      db.auditLog.findMany({
        where,
        include: {
          actor: {
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

    const data = logs.map((log) => ({
      id: log.id,
      actorUserId: log.actorUserId,
      actorNickname: log.actor?.authIdentities[0]?.nickname ?? null,
      actorQQ: log.actor?.qqNumber ?? null,
      action: log.action,
      targetType: log.targetType,
      targetId: log.targetId,
      metadata: log.metadata,
      ip: log.ip,
      createdAt: log.createdAt,
    }));

    return paginated(data, total, page, pageSize);
  } catch (err) {
    console.error('[admin/audit-logs] GET error:', err);
    if (err && typeof err === 'object' && 'status' in err) {
      const appErr = err as { code: string; message: string; status: number };
      return error(appErr.code, appErr.message, appErr.status);
    }
    return error('INTERNAL_ERROR', '服务器内部错误', 500);
  }
}
