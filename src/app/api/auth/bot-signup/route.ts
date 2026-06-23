import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import { sendVerificationCode } from "@/lib/email";
import { generateAndStoreCode, isRateLimited } from "@/lib/verification";
import { logAudit, AUDIT_ACTIONS, getClientIp } from "@/lib/audit";
import { normalizeNicknameInput } from "@/lib/group-card";

/**
 * POST /api/auth/bot-signup
 *
 * Called by the QQ Bot when a user sends /signup in the group.
 * Creates a pending verification and sends an email code to {qqNumber}@qq.com.
 */
export async function POST(req: NextRequest) {
  // 1. Authenticate the bot
  const botSecret = req.headers.get("x-bot-secret");
  if (!botSecret || botSecret !== process.env.BOT_INTERNAL_SECRET) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Invalid bot secret" } },
      { status: 401 }
    );
  }

  // 2. Parse request
  const body = await req.json();
  const { qqNumber, groupId, nickname } = body;

  if (!qqNumber || !groupId) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "qqNumber and groupId are required" } },
      { status: 422 }
    );
  }

  const qqStr = String(qqNumber);

  // 3. Check if user already registered
  const existingUser = await db.user.findFirst({
    where: { qqNumber: qqStr },
  });

  if (existingUser && existingUser.passwordHash) {
    return NextResponse.json({
      data: { status: "already_registered", message: "该QQ号已注册，请直接登录" },
    });
  }

  // 4. Rate limit check
  if (await isRateLimited(qqStr)) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "请等待 60 秒后再试" } },
      { status: 429 }
    );
  }

  // 5. Store bot context (groupId, nickname) for later use during set-passcode
  const contextKey = `auth:context:${qqStr}`;
  await redis.setex(
    contextKey,
    900, // 15 min
    JSON.stringify({
      groupId,
      nickname: normalizeNicknameInput(nickname || "") || null,
    })
  );

  // 6. Generate verification code and send email
  const code = await generateAndStoreCode(qqStr);

  try {
    await sendVerificationCode(qqStr, code);
  } catch (error) {
    console.error("[Bot Signup] Email send failed:", error);
    return NextResponse.json(
      { error: { code: "EMAIL_ERROR", message: "验证码发送失败，请稍后重试" } },
      { status: 500 }
    );
  }

  // 7. Audit log
  await logAudit({
    action: AUDIT_ACTIONS.BOT_TOKEN_ISSUED,
    targetType: "Signup",
    metadata: { qqNumber: qqStr, groupId },
    ip: getClientIp(req),
  });

  return NextResponse.json({
    data: { status: "code_sent", message: "验证码已发送至QQ邮箱" },
  });
}
