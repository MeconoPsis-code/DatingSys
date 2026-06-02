import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { randomBytes, createHash } from "crypto";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { logAudit, AUDIT_ACTIONS, getClientIp } from "@/lib/audit";

const createSchema = z.object({
  qqNumber: z.string().optional(),
  expiresInHours: z.number().int().min(1).max(720).default(24),
  remark: z.string().max(200).optional(),
});

/**
 * POST /api/admin/invite-codes
 *
 * Admin generates a new invite code. Returns the plaintext code once
 * (it is stored as a SHA-256 hash and can never be recovered).
 */
export async function POST(req: NextRequest) {
  const session = await requireRole("ADMIN");

  const body = await req.json();
  const parsed = createSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0].message } },
      { status: 422 }
    );
  }

  const { qqNumber, expiresInHours, remark } = parsed.data;

  // Generate readable 8-char code: uppercase alphanumeric
  const plainCode = randomBytes(5)
    .toString("base64url")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 8)
    .toUpperCase();

  const codeHash = createHash("sha256").update(plainCode).digest("hex");

  const inviteCode = await db.inviteCode.create({
    data: {
      codeHash,
      qqNumber: qqNumber || null,
      status: "UNUSED",
      expiresAt: new Date(Date.now() + expiresInHours * 60 * 60 * 1000),
      createdBy: session.id,
      remark: remark || null,
    },
  });

  await logAudit({
    actorId: session.id,
    action: AUDIT_ACTIONS.INVITE_CREATE,
    targetType: "InviteCode",
    targetId: inviteCode.id,
    metadata: { qqNumber, expiresInHours },
    ip: getClientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return NextResponse.json({
    data: {
      id: inviteCode.id,
      code: plainCode, // Returned once — not stored in plaintext
      qqNumber: inviteCode.qqNumber,
      status: inviteCode.status,
      expiresAt: inviteCode.expiresAt,
      remark: inviteCode.remark,
    },
  });
}

/**
 * GET /api/admin/invite-codes?page=1&pageSize=20&status=UNUSED
 *
 * List invite codes with optional status filter and pagination.
 */
export async function GET(req: NextRequest) {
  await requireRole("ADMIN");

  const { searchParams } = req.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10)));
  const statusFilter = searchParams.get("status");

  const where = statusFilter ? { status: statusFilter as never } : {};

  const [codes, total] = await Promise.all([
    db.inviteCode.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        creator: {
          select: {
            id: true,
            authIdentities: { select: { nickname: true }, take: 1 },
          },
        },
      },
    }),
    db.inviteCode.count({ where }),
  ]);

  return NextResponse.json({
    data: codes.map((c) => ({
      id: c.id,
      codeHash: c.codeHash.slice(0, 8) + "...", // Partial hash for display
      qqNumber: c.qqNumber,
      status: c.status,
      expiresAt: c.expiresAt,
      createdBy: c.creator.authIdentities[0]?.nickname || c.createdBy,
      usedBy: c.usedBy,
      usedAt: c.usedAt,
      remark: c.remark,
      createdAt: c.createdAt,
    })),
    pagination: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  });
}
