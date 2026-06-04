import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { consumeVerifiedFlag } from "@/lib/verification";
import { validatePasscode, hashPassword } from "@/lib/password";
import { logAudit, AUDIT_ACTIONS, getClientIp } from "@/lib/audit";

/**
 * POST /api/auth/reset-passcode
 *
 * Resets the user's passcode after email verification.
 * Requires the "verified" flag from verify-code.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { qqNumber, newPasscode } = body;

  if (!qqNumber || !newPasscode) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "请输入QQ号和新密码" } },
      { status: 422 }
    );
  }

  const qqStr = String(qqNumber);

  // 1. Check verification flag
  const verified = await consumeVerifiedFlag(qqStr);
  if (!verified) {
    return NextResponse.json(
      { error: { code: "NOT_VERIFIED", message: "请先完成邮箱验证" } },
      { status: 403 }
    );
  }

  // 2. Validate new passcode
  const validation = validatePasscode(newPasscode);
  if (!validation.valid) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: validation.message } },
      { status: 422 }
    );
  }

  // 3. Find user
  const user = await db.user.findFirst({
    where: { qqNumber: qqStr },
  });

  if (!user) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "用户不存在" } },
      { status: 404 }
    );
  }

  // 4. Update password
  const passwordHash = await hashPassword(newPasscode);
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });

  // 5. Audit log
  await logAudit({
    actorId: user.id,
    action: AUDIT_ACTIONS.PASSCODE_RESET,
    targetType: "User",
    targetId: user.id,
    metadata: { qqNumber: qqStr },
    ip: getClientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return NextResponse.json({
    data: { success: true, message: "密码已重置，请使用新密码登录" },
  });
}
