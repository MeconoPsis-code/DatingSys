import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { createLogger } from "@/lib/logger";

const log = createLogger("admin:memberships");

/**
 * GET /api/admin/memberships
 *
 * List all group memberships with user info for the admin 群认证 page.
 * Supports filtering by status and search by QQ number / nickname.
 *
 * Query params:
 *   - status: MembershipStatus filter (default: all)
 *   - search: QQ number or nickname substring
 *   - page: page number (default: 1)
 *   - pageSize: items per page (default: 20, max: 100)
 *
 * Requires ADMIN+ role.
 */
export async function GET(req: NextRequest) {
  try {
    await requireRole("ADMIN");

    const { searchParams } = req.nextUrl;
    const status = searchParams.get("status") || "all";
    const search = searchParams.get("search")?.trim() || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10))
    );

    // Build where clause
    const where: Record<string, unknown> = {};

    if (status !== "all") {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { qqNumber: { contains: search } },
        {
          user: {
            authIdentities: {
              some: {
                nickname: { contains: search, mode: "insensitive" },
              },
            },
          },
        },
      ];
    }

    const [memberships, total] = await Promise.all([
      db.groupMembership.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              qqNumber: true,
              status: true,
              role: true,
              createdAt: true,
              authIdentities: {
                select: {
                  nickname: true,
                  avatarUrl: true,
                },
                take: 1,
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.groupMembership.count({ where }),
    ]);

    // Flatten response for easier frontend consumption
    const data = memberships.map((m) => ({
      id: m.id,
      userId: m.userId,
      qqNumber: m.qqNumber,
      groupId: m.groupId,
      status: m.status,
      verifiedAt: m.verifiedAt,
      leftDetectedAt: m.leftDetectedAt,
      leftConfirmedAt: m.leftConfirmedAt,
      restoredAt: m.restoredAt,
      removedAt: m.removedAt,
      leaveType: m.leaveType,
      reviewReason: m.reviewReason,
      createdAt: m.createdAt,
      // User info
      userStatus: m.user.status,
      userRole: m.user.role,
      nickname: m.user.authIdentities[0]?.nickname || null,
      avatarUrl: m.user.authIdentities[0]?.avatarUrl || null,
    }));

    return NextResponse.json({
      data,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (err) {
    log.error({ err }, "Failed to list memberships");
    if (err && typeof err === "object" && "status" in err) {
      const appErr = err as { code: string; message: string; status: number };
      return NextResponse.json(
        { error: { code: appErr.code, message: appErr.message } },
        { status: appErr.status }
      );
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "服务器内部错误" } },
      { status: 500 }
    );
  }
}
