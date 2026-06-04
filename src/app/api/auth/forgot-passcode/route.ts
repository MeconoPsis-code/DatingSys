import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendVerificationCode } from "@/lib/email";
import { generateAndStoreCode, isRateLimited } from "@/lib/verification";

/**
 * POST /api/auth/forgot-passcode
 *
 * Sends a verification code to the user's QQ email for password reset.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { qqNumber } = body;

  if (!qqNumber) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "请输入QQ号" } },
      { status: 422 }
    );
  }

  const qqStr = String(qqNumber);

  // 1. Check user exists
  const user = await db.user.findFirst({
    where: { qqNumber: qqStr },
  });

  if (!user) {
    // Don't reveal whether the account exists — always return success
    return NextResponse.json({
      data: { success: true, message: "如果该QQ号已注册，验证码已发送至对应邮箱" },
    });
  }

  // 2. Rate limit
  if (await isRateLimited(qqStr)) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "请等待 60 秒后再试" } },
      { status: 429 }
    );
  }

  // 3. Generate and send code
  const code = await generateAndStoreCode(qqStr);

  try {
    await sendVerificationCode(qqStr, code);
  } catch (error) {
    console.error("[Forgot Passcode] Email send failed:", error);
    return NextResponse.json(
      { error: { code: "EMAIL_ERROR", message: "邮件发送失败，请稍后重试" } },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: { success: true, message: "验证码已发送至QQ邮箱" },
  });
}
