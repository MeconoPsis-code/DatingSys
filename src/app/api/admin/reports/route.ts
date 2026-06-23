import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { error, paginated } from '@/lib/api-response';
import { getReportEvidenceUrls } from '@/lib/report-evidence';

// ── GET /api/admin/reports — admin report queue ────────

export async function GET(req: Request) {
  try {
    await requireRole('ADMIN');

    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
    const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get('pageSize') || '20')));
    const status = url.searchParams.get('status') || undefined;
    const type = url.searchParams.get('type') || undefined;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (type) where.type = type;

    const [total, reports] = await Promise.all([
      db.report.count({ where }),
      db.report.findMany({
        where,
        include: {
          reporter: {
            include: {
              authIdentities: { select: { nickname: true }, take: 1 },
            },
          },
          target: {
            include: {
              authIdentities: { select: { nickname: true }, take: 1 },
            },
          },
          handler: {
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

    const data = await Promise.all(
      reports.map(async (r) => ({
        id: r.id,
        reporterId: r.reporterId,
        reporterNickname: r.reporter.authIdentities[0]?.nickname ?? null,
        reporterQQ: r.reporter.qqNumber,
        targetUserId: r.targetUserId,
        targetNickname: r.target.authIdentities[0]?.nickname ?? null,
        targetQQ: r.target.qqNumber,
        type: r.type,
        description: r.description,
        status: r.status,
        resolution: r.resolution,
        evidence: await getReportEvidenceUrls(r.evidenceObjectKeys),
        handledBy: r.handledBy,
        handlerNickname: r.handler?.authIdentities[0]?.nickname ?? null,
        handledAt: r.handledAt,
        createdAt: r.createdAt,
      })),
    );

    return paginated(data, total, page, pageSize);
  } catch (err) {
    console.error('[admin/reports] GET error:', err);
    if (err && typeof err === 'object' && 'status' in err) {
      const appErr = err as { code: string; message: string; status: number };
      return error(appErr.code, appErr.message, appErr.status);
    }
    return error('INTERNAL_ERROR', '服务器内部错误', 500);
  }
}
