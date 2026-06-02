import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/membership/status
 *
 * Returns the current user's group membership status.
 */
export async function GET() {
  const session = await requireAuth();

  return NextResponse.json({
    data: {
      membershipStatus: session.membershipStatus,
      membershipExpiresAt: session.membershipExpiresAt,
      qqNumber: session.qqNumber,
    },
  });
}
