import { requireAuth } from '@/lib/auth';
import { db } from '@/lib/db';
import { success, error, paginated } from '@/lib/api-response';
import {
  deleteReportEvidence,
  getReportEvidenceUrls,
  ReportEvidenceError,
  uploadReportEvidenceFiles,
} from '@/lib/report-evidence';
import { hasReportableContext } from '@/lib/report-targets';
import { Prisma } from '@prisma/client';

// ── POST /api/reports — user submits a report ──────────

export async function POST(req: Request) {
  try {
    const session = await requireAuth();
    const contentType = req.headers.get('content-type') || '';
    let targetQQ = '';
    let type = '';
    let description = '';
    let evidenceFiles: File[] = [];

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      if (formData.has('targetUserId')) {
        return error('DEPRECATED_FIELD', '举报接口不再接受targetUserId，请使用targetQQ', 400);
      }
      targetQQ = String(formData.get('targetQQ') || '');
      type = String(formData.get('type') || '');
      description = String(formData.get('description') || '');
      evidenceFiles = formData
        .getAll('evidence')
        .filter((file): file is File => file instanceof File && file.size > 0);
    } else {
      const body = await req.json();
      const parsed = body as {
        targetQQ?: unknown;
        targetUserId?: unknown;
        type?: unknown;
        description?: unknown;
      };
      if (parsed.targetUserId !== undefined) {
        return error('DEPRECATED_FIELD', '举报接口不再接受targetUserId，请使用targetQQ', 400);
      }
      targetQQ = typeof parsed.targetQQ === 'string' ? parsed.targetQQ : '';
      type = typeof parsed.type === 'string' ? parsed.type : '';
      description = typeof parsed.description === 'string' ? parsed.description : '';
    }
    const normalizedTargetQQ = targetQQ.trim();
    const normalizedDescription = description.trim();

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
    if (!normalizedTargetQQ) {
      return error('MISSING_TARGET', '请选择被举报用户', 400);
    }
    if (!validTypes.includes(type)) {
      return error('INVALID_TYPE', '无效的举报类型', 400);
    }
    if (!normalizedDescription || normalizedDescription.length < 5) {
      return error('INVALID_DESCRIPTION', '举报描述至少5个字', 400);
    }
    if (normalizedDescription.length > 1000) {
      return error('DESCRIPTION_TOO_LONG', '举报描述不能超过1000字', 400);
    }

    // Look up user by QQ number
    const target = await db.user.findUnique({
      where: { qqNumber: normalizedTargetQQ },
      include: { profile: { select: { status: true } } },
    });
    if (!target || target.status !== 'ACTIVE' || target.profile?.status !== 'ACTIVE') {
      return error('NOT_FOUND', '未找到可举报的用户', 404);
    }
    const targetId = target.id;

    // Cannot report yourself
    if (targetId === session.id) {
      return error('SELF_REPORT', '不能举报自己', 400);
    }

    const canReportTarget = await hasReportableContext(session.id, targetId);
    if (!canReportTarget) {
      return error('FORBIDDEN_TARGET', '只能举报已通过资料查看申请的用户', 403);
    }

    // Check for duplicate pending report
    const existing = await db.report.findFirst({
      where: {
        reporterId: session.id,
        targetUserId: targetId,
        status: { in: ['PENDING', 'REVIEWING'] },
      },
    });
    if (existing) {
      return error('DUPLICATE', '您已有一个待处理的举报', 400);
    }

    // Create report
    const evidenceKeys = await uploadReportEvidenceFiles(evidenceFiles, session.id);
    let report;
    try {
      report = await db.report.create({
        data: {
          reporterId: session.id,
          targetUserId: targetId,
          type: type as 'FAKE_INFO' | 'STOLEN_PHOTO' | 'IMPERSONATION' | 'HARASSMENT' | 'SCAM' | 'MALICIOUS' | 'OTHER',
          description: normalizedDescription,
          evidenceObjectKeys: evidenceKeys.length > 0
            ? (evidenceKeys as Prisma.InputJsonValue)
            : undefined,
        },
      });
    } catch (err) {
      await deleteReportEvidence(evidenceKeys);
      throw err;
    }

    // Audit log
    await db.auditLog.create({
      data: {
        actorUserId: session.id,
        action: 'REPORT_CREATE',
        targetType: 'Report',
        targetId: report.id,
        metadata: { targetQQ: normalizedTargetQQ, type, evidenceCount: evidenceKeys.length },
      },
    });

    return success({ id: report.id, message: '举报已提交' }, 201);
  } catch (err) {
    console.error('[reports] POST error:', err);
    if (err instanceof ReportEvidenceError) {
      return error(err.code, err.message, err.status);
    }
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

    const data = await Promise.all(
      reports.map(async (r) => ({
        id: r.id,
        targetNickname: r.target.authIdentities[0]?.nickname ?? null,
        targetQQ: r.target.qqNumber,
        type: r.type,
        description: r.description,
        status: r.status,
        resolution: r.resolution,
        evidence: await getReportEvidenceUrls(r.evidenceObjectKeys),
        createdAt: r.createdAt,
        handledAt: r.handledAt,
      })),
    );

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
