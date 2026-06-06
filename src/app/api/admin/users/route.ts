import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { paginated, error } from "@/lib/api-response";
import type { Prisma } from "@prisma/client";

// ── GET /api/admin/users ────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    await requireRole("ADMIN");

    const { searchParams } = req.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10))
    );
    const search = searchParams.get("search") || undefined;
    const role = searchParams.get("role") || undefined;
    const status = searchParams.get("status") || undefined;
    const membershipStatus = searchParams.get("membershipStatus") || undefined;

    // Build where clause
    const where: Prisma.UserWhereInput = {
      status: { not: "DELETED" },
    };

    if (role) {
      where.role = role as Prisma.EnumUserRoleFilter;
    }

    if (status) {
      where.status = status as Prisma.EnumUserStatusFilter;
    }

    if (membershipStatus) {
      where.groupMembership = {
        status: membershipStatus as Prisma.EnumMembershipStatusFilter,
      };
    }

    if (search) {
      where.OR = [
        { qqNumber: { contains: search } },
        {
          authIdentities: {
            some: { nickname: { contains: search } },
          },
        },
      ];
    }

    const [users, total] = await Promise.all([
      db.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          authIdentities: { select: { nickname: true }, take: 1 },
          groupMembership: { select: { status: true } },
          profile: { select: { id: true } },
          _count: { select: { penalties: true } },
        },
      }),
      db.user.count({ where }),
    ]);

    const data = users.map((u) => ({
      id: u.id,
      qqNumber: u.qqNumber,
      role: u.role,
      status: u.status,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
      nickname: u.authIdentities[0]?.nickname ?? null,
      membershipStatus: u.groupMembership?.status ?? null,
      hasProfile: !!u.profile,
      penaltyCount: u._count.penalties,
    }));

    return paginated(data, total, page, pageSize);
  } catch (err) {
    console.error("[admin/users] GET error:", err);
    if (err && typeof err === "object" && "status" in err) {
      const appErr = err as { code: string; message: string; status: number };
      return error(appErr.code, appErr.message, appErr.status);
    }
    return error("INTERNAL_ERROR", "服务器内部错误", 500);
  }
}
