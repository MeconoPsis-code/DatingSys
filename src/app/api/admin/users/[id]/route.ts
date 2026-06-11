import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { success, error } from "@/lib/api-response";

// ── GET /api/admin/users/:id ────────────────────────────

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole("ADMIN");
    const { id } = await params;

    const user = await db.user.findUnique({
      where: { id },
      include: {
        authIdentities: { select: { nickname: true }, take: 1 },
        profile: true,
        preference: true,
        groupMembership: true,
        ratingProfile: {
          select: {
            id: true,
            finalScore: true,
            ratingStatus: true,
            scoreCompletedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        penalties: {
          orderBy: { createdAt: "desc" },
          include: {
            creator: {
              select: {
                id: true,
                authIdentities: { select: { nickname: true }, take: 1 },
              },
            },
          },
        },
      },
    });

    if (!user) {
      return error("NOT_FOUND", "用户不存在", 404);
    }

    // Fetch recent audit logs separately (target-based, not actor-based)
    const recentAuditLogs = await db.auditLog.findMany({
      where: {
        OR: [
          { actorUserId: id },
          { targetId: id, targetType: "User" },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return success({
      id: user.id,
      qqNumber: user.qqNumber,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      nickname: user.authIdentities[0]?.nickname ?? null,
      profile: user.profile,
      preference: user.preference,
      membership: user.groupMembership,
      ratingProfile: user.ratingProfile,
      penalties: user.penalties.map((p) => ({
        id: p.id,
        type: p.type,
        reason: p.reason,
        expiresAt: p.expiresAt,
        revokedAt: p.revokedAt,
        createdAt: p.createdAt,
        createdBy: {
          id: p.creator.id,
          nickname: p.creator.authIdentities[0]?.nickname ?? null,
        },
      })),
      recentAuditLogs,
    });
  } catch (err) {
    console.error("[admin/users/:id] GET error:", err);
    if (err && typeof err === "object" && "status" in err) {
      const appErr = err as { code: string; message: string; status: number };
      return error(appErr.code, appErr.message, appErr.status);
    }
    return error("INTERNAL_ERROR", "服务器内部错误", 500);
  }
}

// ── DELETE /api/admin/users/:id ─────────────────────────

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole("SUPER_ADMIN");
    const { id } = await params;

    // Prevent self-deletion
    if (id === session.id) {
      return error("FORBIDDEN", "不能删除自己的账号", 403);
    }

    const target = await db.user.findUnique({ where: { id } });
    if (!target) {
      return error("NOT_FOUND", "用户不存在", 404);
    }

    // Delete user and all related data in a transaction
    await db.$transaction([
      // Records without cascade that reference this user
      db.ratingScore.deleteMany({ where: { scorerUserId: id } }),
      db.ratingTask.deleteMany({ where: { ratedUserId: id } }),
      db.matchSnapshot.deleteMany({ where: { OR: [{ userId: id }, { targetUserId: id }] } }),
      db.viewRequest.deleteMany({ where: { OR: [{ requesterId: id }, { targetUserId: id }] } }),
      db.report.deleteMany({ where: { OR: [{ reporterId: id }, { targetUserId: id }] } }),
      db.penalty.deleteMany({ where: { OR: [{ userId: id }, { createdBy: id }] } }),
      db.auditLog.deleteMany({ where: { actorUserId: id } }),
      // Records with cascade will be handled automatically
      db.user.delete({ where: { id } }),
    ]);

    // Audit log
    await db.auditLog.create({
      data: {
        actorUserId: session.id,
        action: "ADMIN_DELETE_USER",
        targetType: "User",
        targetId: id,
        metadata: {
          qqNumber: target.qqNumber,
          role: target.role,
        },
      },
    });

    return success({ message: "用户已删除" });
  } catch (err) {
    console.error("[admin/users/:id] DELETE error:", err);
    if (err && typeof err === "object" && "status" in err) {
      const appErr = err as { code: string; message: string; status: number };
      return error(appErr.code, appErr.message, appErr.status);
    }
    return error("INTERNAL_ERROR", "服务器内部错误", 500);
  }
}
