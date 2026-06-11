import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { success, error } from '@/lib/api-response';
import { hasRole } from '@/lib/rbac';

// ── POST /api/admin/reports/:id/resolve ─────────────────

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole('ADMIN');
    const { id } = await params;

    const body = await req.json();
    const { verdict, resolution, action: penaltyAction, reason } = body as {
      verdict: 'accepted' | 'rejected';
      resolution: string;
      action?: 'warn' | 'ban' | null;
      reason?: string;
    };

    // Validate
    if (!['accepted', 'rejected'].includes(verdict)) {
      return error('INVALID_VERDICT', '无效的处理结果', 400);
    }
    if (!resolution || !resolution.trim()) {
      return error('MISSING_RESOLUTION', '请填写处理说明', 400);
    }

    // Load report
    const report = await db.report.findUnique({
      where: { id },
      include: { target: true },
    });
    if (!report) {
      return error('NOT_FOUND', '举报不存在', 404);
    }
    if (report.status !== 'PENDING' && report.status !== 'REVIEWING') {
      return error('ALREADY_RESOLVED', '该举报已被处理', 400);
    }

    // Update report status
    const newStatus = verdict === 'accepted' ? 'ACCEPTED' : 'REJECTED';
    await db.report.update({
      where: { id },
      data: {
        status: newStatus as 'ACCEPTED' | 'REJECTED',
        resolution: resolution.trim(),
        handledBy: session.id,
        handledAt: new Date(),
      },
    });

    // If accepted and penalty action requested, apply it
    if (verdict === 'accepted' && penaltyAction && report.target) {
      const target = report.target;

      // Role escalation check
      if (hasRole(target.role, 'ADMIN') && !hasRole(session.role, 'SUPER_ADMIN')) {
        // Skip penalty for admin targets if not super admin
      } else {
        const penaltyReason = reason?.trim() || `举报处理: ${resolution.trim()}`;

        switch (penaltyAction) {
          case 'warn': {
            await db.penalty.create({
              data: {
                userId: target.id,
                type: 'WARNING',
                reason: penaltyReason,
                createdBy: session.id,
              },
            });
            break;
          }
          case 'ban': {
            await db.$transaction([
              db.penalty.create({
                data: {
                  userId: target.id,
                  type: 'ACCOUNT_BANNED',
                  reason: penaltyReason,
                  createdBy: session.id,
                },
              }),
              db.user.update({
                where: { id: target.id },
                data: { status: 'BANNED' },
              }),
            ]);
            break;
          }
        }

        // Audit log for penalty
        if (penaltyAction) {
          await db.auditLog.create({
            data: {
              actorUserId: session.id,
              action: `ADMIN_${penaltyAction.toUpperCase()}`,
              targetType: 'User',
              targetId: target.id,
              metadata: { reason: penaltyReason, fromReport: id },
            },
          });
        }
      }
    }

    // Audit log for resolution
    await db.auditLog.create({
      data: {
        actorUserId: session.id,
        action: 'REPORT_RESOLVE',
        targetType: 'Report',
        targetId: id,
        metadata: {
          verdict,
          resolution: resolution.trim(),
          penaltyAction: penaltyAction || null,
        },
      },
    });

    return success({ message: '举报已处理' });
  } catch (err) {
    console.error('[admin/reports/:id/resolve] POST error:', err);
    if (err && typeof err === 'object' && 'status' in err) {
      const appErr = err as { code: string; message: string; status: number };
      return error(appErr.code, appErr.message, appErr.status);
    }
    return error('INTERNAL_ERROR', '服务器内部错误', 500);
  }
}
