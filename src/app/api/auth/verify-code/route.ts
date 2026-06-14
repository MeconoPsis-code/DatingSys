import { NextRequest, NextResponse } from "next/server";
import { validateCodeOnly } from "@/lib/verification";

/**
 * POST /api/auth/verify-code
 *
 * User enters only the verification code received via email.
 * The code uniquely maps to a QQ number via Redis reverse lookup.
 * On success, sets a "verified" flag in Redis (15min) to allow passcode setup,
 * and returns the qqNumber to the frontend for the next step.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { code } = body;

  if (!code) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "请输入验证码" } },
      { status: 422 }
    );
  }

  const codeStr = String(code).trim().toUpperCase();

  const qqNumber = await validateCodeOnly(codeStr);

  if (!qqNumber) {
    return NextResponse.json(
      { error: { code: "INVALID_CODE", message: "验证码错误或已过期" } },
      { status: 422 }
    );
  }

  return NextResponse.json({
    data: { verified: true, qqNumber, message: "验证成功，请设置密码" },
  });
}
