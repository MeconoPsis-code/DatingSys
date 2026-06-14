import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/auth/me
 *
 * Returns the current authenticated user's info plus active penalties.
 */
export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "请先登录" } },
      { status: 401 }
    );
  }

  // Query active (unrevoked) penalties for this user
  const activePenalties = await db.penalty.findMany({
    where: {
      userId: session.id,
      revokedAt: null,
    },
    select: {
      id: true,
      type: true,
      reason: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    data: {
      id: session.id,
      role: session.role,
      status: session.status,
      qqNumber: session.qqNumber,
      nickname: session.nickname,
      avatarUrl: session.avatarUrl,
      membershipStatus: session.membershipStatus,
      membershipExpiresAt: session.membershipExpiresAt,
      activePenalties,
    },
  });
}
