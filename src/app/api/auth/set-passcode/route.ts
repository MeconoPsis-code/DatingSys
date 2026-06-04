import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import { consumeVerifiedFlag } from "@/lib/verification";
import { validatePasscode, hashPassword } from "@/lib/password";
import { createSession } from "@/lib/session";
import { logAudit, AUDIT_ACTIONS, getClientIp } from "@/lib/audit";

/**
 * POST /api/auth/set-passcode
 *
 * After email verification, user sets their passcode to complete signup.
 * Requires the "verified" flag in Redis (set by verify-code endpoint).
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

  // 1. Check verification flag
  const verified = await consumeVerifiedFlag(qqStr);
  if (!verified) {
    return NextResponse.json(
      { error: { code: "NOT_VERIFIED", message: "请先完成邮箱验证" } },
      { status: 403 }
    );
  }

  // 2. Validate passcode rules
  const validation = validatePasscode(passcode);
  if (!validation.valid) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: validation.message } },
      { status: 422 }
    );
  }

  // 3. Hash passcode
  const passwordHash = await hashPassword(passcode);

  // 4. Retrieve bot context (groupId, nickname)
  const contextKey = `auth:context:${qqStr}`;
  const contextRaw = await redis.get(contextKey);
  const context = contextRaw ? JSON.parse(contextRaw) : {};
  await redis.del(contextKey);

  // 5. Create or update user with credentials
  let user = await db.user.findFirst({ where: { qqNumber: qqStr } });

  if (!user) {
    // New user — full creation
    user = await db.user.create({
      data: {
        qqNumber: qqStr,
        passwordHash,
        role: "USER",
        status: "ACTIVE",
        lastLoginAt: new Date(),
        authIdentities: {
          create: {
            provider: "qq_bot",
            providerUserId: qqStr,
            openid: `bot_${qqStr}`,
            nickname: context.nickname || null,
          },
        },
        groupMembership: {
          create: {
            qqNumber: qqStr,
            groupId: context.groupId || "default",
            status: "VERIFIED",
            verifiedAt: new Date(),
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            remark: "Auto-verified via bot signup",
          },
        },
      },
    });
  } else {
    // Existing user (e.g., seeded) — set password
    await db.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        lastLoginAt: new Date(),
      },
    });
  }

  // 6. Create session
  await createSession(user.id, user.role);

  // 7. Audit log
  await logAudit({
    actorId: user.id,
    action: AUDIT_ACTIONS.LOGIN,
    targetType: "User",
    targetId: user.id,
    metadata: { qqNumber: qqStr, method: "signup" },
    ip: getClientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return NextResponse.json({
    data: { success: true, message: "注册成功" },
  });
}
