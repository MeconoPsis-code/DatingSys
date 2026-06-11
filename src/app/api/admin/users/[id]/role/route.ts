import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { success, error } from '@/lib/api-response';

const ASSIGNABLE_ROLES = ['USER', 'SCORER', 'ADMIN'] as const;
type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

/**
 * POST /api/admin/users/[id]/role
 * Super admin changes a user's role.
 * Body: { role: "USER" | "SCORER" | "ADMIN" }
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole('SUPER_ADMIN');
    const { id } = await params;

    // Cannot change own role
    if (id === session.id) {
      return error('FORBIDDEN', '不能修改自己的角色', 403);
    }

    const body = await req.json();
    const { role } = body as { role?: string };

    if (!role || !ASSIGNABLE_ROLES.includes(role as AssignableRole)) {
      return error('VALIDATION', `无效角色，可选: ${ASSIGNABLE_ROLES.join(', ')}`, 400);
    }

    // Cannot assign SUPER_ADMIN via this endpoint
    if (role === 'SUPER_ADMIN') {
      return error('FORBIDDEN', '无法通过此接口设置超级管理员', 403);
    }

    const target = await db.user.findUnique({
      where: { id },
      select: { id: true, role: true },
    });

    if (!target) {
      return error('NOT_FOUND', '用户不存在', 404);
    }

    // Cannot change another SUPER_ADMIN's role
    if (target.role === 'SUPER_ADMIN') {
      return error('FORBIDDEN', '无法修改超级管理员的角色', 403);
    }

    if (target.role === role) {
      return error('NO_CHANGE', '用户已经是该角色', 400);
    }

    const oldRole = target.role;

    await db.user.update({
      where: { id },
      data: { role: role as AssignableRole },
    });

    // Audit log
    await db.auditLog.create({
      data: {
        actorUserId: session.id,
        action: 'ADMIN_ROLE_CHANGE',
        targetType: 'User',
        targetId: id,
        metadata: { oldRole, newRole: role },
      },
    });

    const ROLE_LABELS: Record<string, string> = {
      USER: '用户',
      SCORER: '评分员',
      ADMIN: '管理员',
    };

    return success({
      message: `角色已从「${ROLE_LABELS[oldRole] || oldRole}」变更为「${ROLE_LABELS[role] || role}」`,
      oldRole,
      newRole: role,
    });
  } catch (err) {
    console.error('[admin/users/:id/role] POST error:', err);
    if (err && typeof err === 'object' && 'status' in err) {
      const appErr = err as { code: string; message: string; status: number };
      return error(appErr.code, appErr.message, appErr.status);
    }
    return error('INTERNAL_ERROR', '服务器内部错误', 500);
  }
}
