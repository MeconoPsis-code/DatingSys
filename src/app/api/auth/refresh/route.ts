import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createSession } from "@/lib/session";
import { db } from "@/lib/db";

/**
 * POST /api/auth/refresh
 *
 * Re-creates the session JWT with updated hasProfile flag.
 * Called after profile creation to update the JWT so middleware
 * stops redirecting to /complete-profile.
 */
export async function POST() {
  const session = await getSession();
  const noStoreHeaders = { "Cache-Control": "no-store" };

  if (!session) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "请先登录" } },
      { status: 401, headers: noStoreHeaders }
    );
  }

  // Check current profile existence
  const profile = await db.profile.findUnique({
    where: { userId: session.id },
    select: { id: true },
  });

  // Re-create session with updated hasProfile flag
  await createSession(session.id, session.role, !!profile);

  return NextResponse.json(
    {
      data: { success: true, hasProfile: !!profile, role: session.role },
    },
    { headers: noStoreHeaders }
  );
}
