import { requireAuth } from '@/lib/auth';
import { db } from '@/lib/db';
import { success, error, paginated } from '@/lib/api-response';

// ── POST /api/reports — user submits a report ──────────

export async function POST(req: Request) {
  try {
    const session = await requireAuth();
    const body = await req.json();
    const { targetUserId, type, description } = body as {
      targetUserId: string;
      type: string;
      description: string;
    };

    // Validate
    const validTypes = [
      'FAKE_INFO',
      'STOLEN_PHOTO',
      'IMPERSONATION',
      'HARASSMENT',
      'SCAM',
      'MALICIOUS',
      'OTHER',
    ];
    if (!targetUserId) {
      return error('MISSING_TARGET', '请指定举报对象', 400);
    }
    if (!validTypes.includes(type)) {
      return error('INVALID_TYPE', '无效的举报类型', 400);
    }
    if (!description || description.trim().length < 5) {
      return error('INVALID_DESCRIPTION', '举报描述至少5个字', 400);
    }
    if (description.trim().length > 1000) {
      return error('DESCRIPTION_TOO_LONG', '举报描述不能超过1000字', 400);
    }

    // Cannot report yourself
    if (targetUserId === session.id) {
      return error('SELF_REPORT', '不能举报自己', 400);
    }

    // Check target exists
    const target = await db.user.findUnique({ where: { id: targetUserId } });
    if (!target) {
      return error('NOT_FOUND', '被举报用户不存在', 404);
    }

    // Check for duplicate pending report
    const existing = await db.report.findFirst({
      where: {
        reporterId: session.id,
        targetUserId,
        status: { in: ['PENDING', 'REVIEWING'] },
      },
    });
    if (existing) {
      return error('DUPLICATE', '您已有一个待处理的举报', 400);
    }

    // Create report
    const report = await db.report.create({
      data: {
        reporterId: session.id,
        targetUserId,
        type: type as 'FAKE_INFO' | 'STOLEN_PHOTO' | 'IMPERSONATION' | 'HARASSMENT' | 'SCAM' | 'MALICIOUS' | 'OTHER',
        description: description.trim(),
      },
    });

    // Audit log
    await db.auditLog.create({
      data: {
        actorUserId: session.id,
        action: 'REPORT_CREATE',
        targetType: 'Report',
        targetId: report.id,
        metadata: { targetUserId, type },
      },
    });

    return success({ id: report.id, message: '举报已提交' }, 201);
  } catch (err) {
    console.error('[reports] POST error:', err);
    if (err && typeof err === 'object' && 'status' in err) {
      const appErr = err as { code: string; message: string; status: number };
      return error(appErr.code, appErr.message, appErr.status);
    }
    return error('INTERNAL_ERROR', '服务器内部错误', 500);
  }
}

// ── GET /api/reports — user's own report history ───────

export async function GET(req: Request) {
  try {
    const session = await requireAuth();

    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
    const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get('pageSize') || '20')));

    const where = { reporterId: session.id };

    const [total, reports] = await Promise.all([
      db.report.count({ where }),
      db.report.findMany({
        where,
        include: {
          target: {
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

    const data = reports.map((r) => ({
      id: r.id,
      targetUserId: r.targetUserId,
      targetNickname: r.target.authIdentities[0]?.nickname ?? null,
      targetQQ: r.target.qqNumber,
      type: r.type,
      description: r.description,
      status: r.status,
      resolution: r.resolution,
      createdAt: r.createdAt,
      handledAt: r.handledAt,
    }));

    return paginated(data, total, page, pageSize);
  } catch (err) {
    console.error('[reports] GET error:', err);
    if (err && typeof err === 'object' && 'status' in err) {
      const appErr = err as { code: string; message: string; status: number };
      return error(appErr.code, appErr.message, appErr.status);
    }
    return error('INTERNAL_ERROR', '服务器内部错误', 500);
  }
}
