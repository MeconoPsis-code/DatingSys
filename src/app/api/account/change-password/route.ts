import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { validatePasscode, hashPassword, verifyPassword } from "@/lib/password";
import { logAudit, AUDIT_ACTIONS, getClientIp } from "@/lib/audit";

/**
 * POST /api/account/change-password
 *
 * Changes the logged-in user's password.
 * Requires the current password for verification (no email code needed).
 */
export async function POST(req: NextRequest) {
  const session = await requireAuth();

  const body = await req.json();
  const { currentPassword, newPassword } = body;

  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "请输入当前密码和新密码" } },
      { status: 422 }
    );
  }

  // 1. Fetch user with password hash
  const user = await db.user.findUnique({
    where: { id: session.id },
  });

  if (!user || !user.passwordHash) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "用户不存在或未设置密码" } },
      { status: 404 }
    );
  }

  // 2. Verify current password
  const isCurrentValid = await verifyPassword(currentPassword, user.passwordHash);
  if (!isCurrentValid) {
    return NextResponse.json(
      { error: { code: "INVALID_PASSWORD", message: "当前密码错误" } },
      { status: 403 }
    );
  }

  // 3. Check new password is not the same as old
  if (currentPassword === newPassword) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "新密码不能与旧密码相同" } },
      { status: 422 }
    );
  }

  // 4. Validate new password rules
  const validation = validatePasscode(newPassword);
  if (!validation.valid) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: validation.message } },
      { status: 422 }
    );
  }

  // 5. Update password
  const passwordHash = await hashPassword(newPassword);
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });

  // 6. Audit log
  await logAudit({
    actorId: user.id,
    action: AUDIT_ACTIONS.PASSCODE_RESET,
    targetType: "User",
    targetId: user.id,
    metadata: { method: "change_password" },
    ip: getClientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return NextResponse.json({
    data: { success: true, message: "密码修改成功" },
  });
}
