import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { logAudit, AUDIT_ACTIONS, getClientIp } from "@/lib/audit";

/**
 * POST /api/admin/invite-codes/[id]/revoke
 *
 * Revokes an unused invite code.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireRole("ADMIN");
  const { id } = await params;

  const code = await db.inviteCode.findUnique({ where: { id } });

  if (!code) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "邀请码不存在" } },
      { status: 404 }
    );
  }

  if (code.status !== "UNUSED") {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "只能撤销未使用的邀请码" } },
      { status: 422 }
    );
  }

  await db.inviteCode.update({
    where: { id },
    data: { status: "REVOKED" },
  });

  await logAudit({
    actorId: session.id,
    action: AUDIT_ACTIONS.INVITE_REVOKE,
    targetType: "InviteCode",
    targetId: id,
    ip: getClientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return NextResponse.json({
    data: { message: "邀请码已撤销", id },
  });
}
