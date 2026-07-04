import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { deleteUsersPermanently } from "@/lib/admin-user-delete";
import { MembershipStatus } from "@prisma/client";
import { createLogger } from "@/lib/logger";

const log = createLogger("admin:memberships:batch");

/**
 * POST /api/admin/memberships/batch-purge
 *
 * Batch purge users who have left the QQ group.
 * Only users with LEFT_PENDING_REVIEW or LEFT_CONFIRMED status can be purged.
 *
 * Body: { membershipIds: string[] }
 *
 * Requires ADMIN+ role.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireRole("ADMIN");

    const body = await req.json();
    const { membershipIds } = body;

    if (!Array.isArray(membershipIds) || membershipIds.length === 0) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "请选择要清除的用户" } },
        { status: 422 }
      );
    }

    if (membershipIds.length > 50) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "单次批量操作最多50个用户",
          },
        },
        { status: 422 }
      );
    }

    // Fetch memberships with purgeable statuses
    const memberships = await db.groupMembership.findMany({
      where: {
        id: { in: membershipIds },
        status: {
          in: [
            MembershipStatus.LEFT_PENDING_REVIEW,
            MembershipStatus.LEFT_CONFIRMED,
          ],
        },
      },
      include: {
        user: {
          select: { id: true, qqNumber: true },
        },
      },
    });

    if (memberships.length === 0) {
      return NextResponse.json(
        {
          error: {
            code: "NO_PURGEABLE",
            message: "所选用户中没有可清除的记录（仅支持「待审核」和「已确认退群」状态）",
          },
        },
        { status: 422 }
      );
    }

    const membershipsWithUsers = memberships.filter((membership) => membership.user);
    const missingUsers = memberships.filter((membership) => !membership.user);
    const userIds = membershipsWithUsers.map((membership) => membership.user!.id);

    if (missingUsers.length > 0) {
      await db.groupMembership.updateMany({
        where: { id: { in: missingUsers.map((membership) => membership.id) } },
        data: {
          status: MembershipStatus.REMOVED,
          removedAt: new Date(),
          reviewedBy: session.id,
          reviewRemark: "Batch marked removed after user record was missing",
        },
      });
    }

    const deleteResult = await deleteUsersPermanently({
      actorId: session.id,
      userIds,
      auditAction: "ADMIN_GROUP_MEMBERSHIP_BATCH_PURGE_USER",
      auditMetadata: { mode: "group_membership_batch_purge" },
      groupMembershipRemovalRemark: "Batch purged from membership admin",
      groupMembershipReviewResolution: "batch_purged",
    });

    const deletedUserIds = new Set(deleteResult.deletedUsers.map((user) => user.id));
    const results: { qqNumber: string; success: boolean; error?: string }[] = [
      ...membershipsWithUsers.map((membership) => ({
        qqNumber: membership.user?.qqNumber || membership.qqNumber,
        success: deletedUserIds.has(membership.user!.id),
        error: deletedUserIds.has(membership.user!.id) ? undefined : "User was not deleted",
      })),
      ...missingUsers.map((membership) => ({
        qqNumber: membership.qqNumber,
        success: true,
      })),
    ];

    const purged = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    log.info(
      {
        adminId: session.id,
        requested: membershipIds.length,
        purged,
        failed,
      },
      "Batch purge completed"
    );

    return NextResponse.json({
      data: {
        purged,
        failed,
        total: membershipIds.length,
        results,
      },
    });
  } catch (err) {
    log.error({ err }, "Batch purge failed");
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
