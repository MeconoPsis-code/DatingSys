import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { success, error } from '@/lib/api-response';
import { hasRole } from '@/lib/rbac';

// ── POST /api/admin/users/:id/action ────────────────────

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole('ADMIN');
    const { id } = await params;

    const body = await req.json();
    const { action, reason } = body as { action: string; reason: string };

    // Validate input
    const validActions = ['warn', 'ban', 'unban', 'revoke_warn', 'revoke_ban', 'approve_delete', 'cancel_delete'];
    if (!validActions.includes(action)) {
      return error('INVALID_ACTION', `无效操作: ${action}`, 400);
    }
    if (!reason || !reason.trim()) {
      return error('MISSING_REASON', '请填写操作原因', 400);
    }

    // Load target user
    const target = await db.user.findUnique({ where: { id } });
    if (!target) {
      return error('NOT_FOUND', '用户不存在', 404);
    }

    // Role escalation check: ADMIN cannot act on ADMIN/SUPER_ADMIN targets
    if (hasRole(target.role, 'ADMIN') && !hasRole(session.role, 'SUPER_ADMIN')) {
      return error(
        'FORBIDDEN',
        '权限不足：无法对管理员执行此操作，请联系超级管理员',
        403
      );
    }

    // Execute action
    let autoBanned = false;
    switch (action) {
      case 'warn': {
        await db.penalty.create({
          data: {
            userId: id,
            type: 'WARNING',
            reason: reason.trim(),
            createdBy: session.id,
          },
        });

        // Auto-ban if active warnings > 3
        const activeWarnings = await db.penalty.count({
          where: { userId: id, type: 'WARNING', revokedAt: null },
        });
        if (activeWarnings > 3 && target.status !== 'BANNED') {
          const autoBanReason = '被警告次数大于3次';
          await db.$transaction([
            db.penalty.create({
              data: {
                userId: id,
                type: 'ACCOUNT_BANNED',
                reason: autoBanReason,
                createdBy: session.id,
              },
            }),
            db.user.update({
              where: { id },
              data: { status: 'BANNED' },
            }),
          ]);
          await db.auditLog.create({
            data: {
              actorUserId: session.id,
              action: 'ADMIN_AUTO_BAN',
              targetType: 'User',
              targetId: id,
              metadata: { reason: autoBanReason, warningCount: activeWarnings },
            },
          });
          autoBanned = true;
        }
        break;
      }


      case 'ban': {
        await db.$transaction([
          db.penalty.create({
            data: {
              userId: id,
              type: 'ACCOUNT_BANNED',
              reason: reason.trim(),
              createdBy: session.id,
            },
          }),
          db.user.update({
            where: { id },
            data: { status: 'BANNED' },
          }),
        ]);
        break;
      }

      case 'unban': {
        await db.$transaction([
          db.penalty.updateMany({
            where: {
              userId: id,
              type: 'ACCOUNT_BANNED',
              revokedAt: null,
            },
            data: { revokedAt: new Date() },
          }),
          db.user.update({
            where: { id },
            data: { status: 'ACTIVE' },
          }),
        ]);
        break;
      }

      case 'revoke_warn': {
        await db.penalty.updateMany({
          where: {
            userId: id,
            type: 'WARNING',
            revokedAt: null,
          },
          data: { revokedAt: new Date() },
        });
        break;
      }

      case 'revoke_ban': {
        await db.$transaction([
          db.penalty.updateMany({
            where: {
              userId: id,
              type: { in: ['ACCOUNT_BANNED', 'WARNING'] },
              revokedAt: null,
            },
            data: { revokedAt: new Date() },
          }),
          db.user.update({
            where: { id },
            data: { status: 'ACTIVE' },
          }),
        ]);
        break;
      }

      case 'approve_delete': {
        // Only super admin can approve deletion
        if (!hasRole(session.role, 'SUPER_ADMIN')) {
          return error('FORBIDDEN', '只有超级管理员可以审批删除', 403);
        }
        if (target.status !== 'PENDING_DELETE') {
          return error('INVALID_STATE', '该用户未申请删除', 400);
        }
        // Hard delete: remove all related data
        // ProfilePhoto is cascade-deleted via Profile
        await db.$transaction([
          db.ratingScore.deleteMany({ where: { scorerUserId: id } }),
          db.ratingTask.deleteMany({ where: { ratedUserId: id } }),
          db.ratingProfile.deleteMany({ where: { userId: id } }),
          db.viewRequest.deleteMany({ where: { OR: [{ requesterId: id }, { targetUserId: id }] } }),
          db.matchSnapshot.deleteMany({ where: { OR: [{ userId: id }, { targetUserId: id }] } }),
          db.report.deleteMany({ where: { OR: [{ reporterId: id }, { targetUserId: id }] } }),
          db.preference.deleteMany({ where: { userId: id } }),
          db.profile.deleteMany({ where: { userId: id } }),
          db.groupMembership.deleteMany({ where: { userId: id } }),
          db.authIdentity.deleteMany({ where: { userId: id } }),
          db.penalty.deleteMany({ where: { userId: id } }),
          db.auditLog.deleteMany({ where: { actorUserId: id } }),
          db.user.delete({ where: { id } }),
        ]);
        break;
      }

      case 'cancel_delete': {
        if (target.status !== 'PENDING_DELETE') {
          return error('INVALID_STATE', '该用户未处于待删除状态', 400);
        }
        await db.user.update({
          where: { id },
          data: { status: 'ACTIVE' },
        });
        break;
      }
    }

    // Create audit log (skip for approve_delete — user is gone)
    if (action !== 'approve_delete') {
      await db.auditLog.create({
        data: {
          actorUserId: session.id,
          action: `ADMIN_${action.toUpperCase()}`,
          targetType: 'User',
          targetId: id,
          metadata: { reason: reason.trim() },
        },
      });
    }

    const actionLabels: Record<string, string> = {
      warn: '警告已发出',
      ban: '账号已封禁',
      unban: '账号已解封',
      revoke_warn: '警告已撤销',
      revoke_ban: '封禁已撤销',
      approve_delete: '账号已永久删除',
      cancel_delete: '删除请求已撤销，账号已恢复',
    };

    let message = actionLabels[action] || '操作成功';
    if (autoBanned) {
      message += '，该用户被警告次数大于3次，已被自动封禁';
    }

    return success({ message });
  } catch (err) {
    console.error('[admin/users/:id/action] POST error:', err);
    if (err && typeof err === 'object' && 'status' in err) {
      const appErr = err as { code: string; message: string; status: number };
      return error(appErr.code, appErr.message, appErr.status);
    }
    return error('INTERNAL_ERROR', '服务器内部错误', 500);
  }
}
