import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { createSession } from "@/lib/session";
import { logAudit, AUDIT_ACTIONS, getClientIp } from "@/lib/audit";

/**
 * POST /api/auth/login
 *
 * Standard login with QQ号 + passcode.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { qqNumber, passcode } = body;

  if (!qqNumber || !passcode) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "请输入QQ号和密码" } },
      { status: 422 }
    );
  }

  const qqStr = String(qqNumber);

  // 1. Find user by QQ number
  const user = await db.user.findFirst({
    where: { qqNumber: qqStr },
  });

  if (!user || !user.passwordHash) {
    return NextResponse.json(
      { error: { code: "AUTH_FAILED", message: "QQ号或密码错误" } },
      { status: 401 }
    );
  }

  // 2. Check user status
  if (user.status === "BANNED") {
    return NextResponse.json(
      { error: { code: "ACCOUNT_LOCKED", message: "账号已被封禁，请联系管理员" } },
      { status: 403 }
    );
  }

  // 3. Verify passcode
  const valid = await verifyPassword(passcode, user.passwordHash);
  if (!valid) {
    return NextResponse.json(
      { error: { code: "AUTH_FAILED", message: "QQ号或密码错误" } },
      { status: 401 }
    );
  }

  // 4. Create session
  await createSession(user.id, user.role);

  // 5. Update last login
  await db.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  // 6. Audit log
  await logAudit({
    actorId: user.id,
    action: AUDIT_ACTIONS.LOGIN,
    targetType: "User",
    targetId: user.id,
    metadata: { qqNumber: qqStr, method: "passcode" },
    ip: getClientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return NextResponse.json({
    data: { success: true, message: "登录成功" },
  });
}
