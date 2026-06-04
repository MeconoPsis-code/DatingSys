import { NextRequest, NextResponse } from "next/server";
import { validateCode } from "@/lib/verification";

/**
 * POST /api/auth/verify-code
 *
 * User enters QQ号 + verification code received via email.
 * On success, sets a "verified" flag in Redis (15min) to allow passcode setup.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { qqNumber, code } = body;

  if (!qqNumber || !code) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "请输入QQ号和验证码" } },
      { status: 422 }
    );
  }

  const qqStr = String(qqNumber);
  const codeStr = String(code).trim();

  const valid = await validateCode(qqStr, codeStr);

  if (!valid) {
    return NextResponse.json(
      { error: { code: "INVALID_CODE", message: "验证码错误或已过期" } },
      { status: 422 }
    );
  }

  return NextResponse.json({
    data: { verified: true, message: "验证成功，请设置密码" },
  });
}
