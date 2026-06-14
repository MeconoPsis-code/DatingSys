import { requireAuth } from '@/lib/auth';
import { db } from '@/lib/db';
import { success, error } from '@/lib/api-response';

/**
 * POST /api/account/delete
 * User requests account deletion. Sets status to PENDING_DELETE.
 * The user will be logged out and cannot log back in.
 * Actual deletion from DB requires super admin approval.
 */
export async function POST(req: Request) {
  try {
    const session = await requireAuth();

    const body = await req.json();
    const { confirmation } = body as { confirmation: string };

    if (confirmation !== '确认删除账号') {
      return error('VALIDATION', '请输入正确的确认文字', 400);
    }

    // Check if already pending delete
    if (session.status === 'PENDING_DELETE') {
      return error('CONFLICT', '账号已在待删除状态', 409);
    }

    // Mark user as pending delete
    await db.user.update({
      where: { id: session.id },
      data: {
        status: 'PENDING_DELETE',
      },
    });

    // Audit log
    await db.auditLog.create({
      data: {
        actorUserId: session.id,
        action: 'ACCOUNT_DELETE_REQUEST',
        targetType: 'User',
        targetId: session.id,
        metadata: { reason: 'User requested account deletion' },
      },
    });

    return success({ message: '账号删除请求已提交，等待管理员审核' });
  } catch (err) {
    console.error('[account/delete] POST error:', err);
    if (err && typeof err === 'object' && 'status' in err) {
      const appErr = err as { code: string; message: string; status: number };
      return error(appErr.code, appErr.message, appErr.status);
    }
    return error('INTERNAL_ERROR', '服务器内部错误', 500);
  }
}
