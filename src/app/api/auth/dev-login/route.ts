import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSession } from "@/lib/session";
import { logAudit, AUDIT_ACTIONS, getClientIp } from "@/lib/audit";

/**
 * GET /api/auth/dev-login?userId=seed-user-1
 *
 * Development-only login bypass for testing without a QQ bot.
 * Looks up a user by ID, creates a session, and redirects to /profile.
 */
export async function GET(req: NextRequest) {
  // Only available in development
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Dev login is not available in production" } },
      { status: 403 }
    );
  }

  const userId = req.nextUrl.searchParams.get("userId");

  if (!userId) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "userId query parameter is required" } },
      { status: 422 }
    );
  }

  const user = await db.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: `User ${userId} not found` } },
      { status: 404 }
    );
  }

  // Check if user has a profile
  const existingProfile = await db.profile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });

  // Create session
  await createSession(user.id, user.role, !!existingProfile);

  // Update last login
  await db.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  // Audit log
  await logAudit({
    actorId: user.id,
    action: AUDIT_ACTIONS.DEV_LOGIN,
    targetType: "User",
    targetId: user.id,
    metadata: { method: "dev_bypass" },
    ip: getClientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return NextResponse.redirect(new URL("/profile", appUrl));
}
