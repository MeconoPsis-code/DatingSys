import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

/**
 * GET /api/auth/me
 *
 * Returns the current authenticated user's info.
 */
export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "请先登录" } },
      { status: 401 }
    );
  }

  return NextResponse.json({
    data: {
      id: session.id,
      role: session.role,
      status: session.status,
      qqNumber: session.qqNumber,
      nickname: session.nickname,
      membershipStatus: session.membershipStatus,
      membershipExpiresAt: session.membershipExpiresAt,
    },
  });
}
