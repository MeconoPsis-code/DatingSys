import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { createHash } from "crypto";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { logAudit, AUDIT_ACTIONS, getClientIp } from "@/lib/audit";

const submitSchema = z.object({
  qqNumber: z.string().min(5, "QQ号格式不正确").max(15),
  inviteCode: z.string().min(1, "请输入邀请码"),
});

/**
 * POST /api/membership/submit-code
 *
 * Fallback membership verification via admin-issued invite code.
 * Primary flow is bot-based auto-verification; this is for edge cases.
 */
export async function POST(req: NextRequest) {
  const session = await requireAuth();

  const body = await req.json();
  const parsed = submitSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0].message } },
      { status: 422 }
    );
  }

  const { qqNumber, inviteCode } = parsed.data;
  const codeHash = createHash("sha256").update(inviteCode).digest("hex");

  // 1. Find the invite code
  const code = await db.inviteCode.findUnique({
    where: { codeHash },
  });

  if (!code) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "邀请码不存在" } },
      { status: 404 }
    );
  }

  if (code.status !== "UNUSED") {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "邀请码已使用或已失效" } },
      { status: 422 }
    );
  }

  if (code.expiresAt < new Date()) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "邀请码已过期" } },
      { status: 422 }
    );
  }

  // If code is bound to a QQ number, verify it matches
  if (code.qqNumber && code.qqNumber !== qqNumber) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "邀请码与QQ号不匹配" } },
      { status: 422 }
    );
  }

  // 2. Transaction: use code + verify membership
  await db.$transaction([
    // Mark code as used
    db.inviteCode.update({
      where: { id: code.id },
      data: {
        status: "USED",
        usedBy: session.id,
        usedAt: new Date(),
      },
    }),
    // Upsert group membership
    db.groupMembership.upsert({
      where: { userId: session.id },
      create: {
        userId: session.id,
        qqNumber,
        status: "VERIFIED",
        verifiedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        remark: "Verified via invite code",
      },
      update: {
        qqNumber,
        status: "VERIFIED",
        verifiedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        remark: "Re-verified via invite code",
      },
    }),
  ]);

  // 3. Audit logs
  await logAudit({
    actorId: session.id,
    action: AUDIT_ACTIONS.INVITE_USE,
    targetType: "InviteCode",
    targetId: code.id,
    metadata: { qqNumber },
    ip: getClientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  await logAudit({
    actorId: session.id,
    action: AUDIT_ACTIONS.MEMBERSHIP_VERIFY,
    targetType: "GroupMembership",
    targetId: session.id,
    metadata: { qqNumber, method: "invite_code" },
    ip: getClientIp(req),
  });

  return NextResponse.json({
    data: {
      message: "认证成功",
      membershipStatus: "VERIFIED",
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
}
