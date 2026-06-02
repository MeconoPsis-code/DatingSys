import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { destroySession } from "@/lib/session";
import { logAudit, AUDIT_ACTIONS, getClientIp } from "@/lib/audit";

/**
 * POST /api/auth/logout
 *
 * Destroys the session cookie and logs the action.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();

  if (session) {
    await logAudit({
      actorId: session.id,
      action: AUDIT_ACTIONS.LOGOUT,
      targetType: "User",
      targetId: session.id,
      ip: getClientIp(req),
      userAgent: req.headers.get("user-agent"),
    });
  }

  await destroySession();

  return NextResponse.json({ data: { message: "已退出登录" } });
}
