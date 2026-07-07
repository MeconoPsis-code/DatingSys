import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { success, error } from "@/lib/api-response";
import { deleteUsersPermanently } from "@/lib/admin-user-delete";
import { buildImageProxyUrl } from "@/lib/image-proxy";

// ── GET /api/admin/users/:id ────────────────────────────

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole("ADMIN");
    const { id } = await params;

    const user = await db.user.findUnique({
      where: { id },
      include: {
        authIdentities: { select: { nickname: true }, take: 1 },
        profile: {
          include: {
            photos: { orderBy: { order: "asc" } },
          },
        },
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
        OR: [{ actorUserId: id }, { targetId: id, targetType: "User" }],
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const photos = user.profile
      ? user.profile.photos.map((photo) => ({
          id: photo.id,
          order: photo.order,
          originalName: photo.originalName,
          url: buildImageProxyUrl(photo.storageKey, {
            viewerId: session.id,
            variant: "large",
          }),
        }))
      : [];

    const profile = user.profile
      ? {
          id: user.profile.id,
          birthDate: user.profile.birthDate,
          heightCm: user.profile.heightCm,
          weightKg: user.profile.weightKg,
          provinceCode: user.profile.provinceCode,
          cityCode: user.profile.cityCode,
          locationType: user.profile.locationType,
          attribute: user.profile.attribute,
          isSide: user.profile.isSide,
          isOther: user.profile.isOther,
          customAttribute: user.profile.customAttribute,
          mbti: user.profile.mbti,
          selfIntro: user.profile.selfIntro,
          status: user.profile.status,
          photoMatchPref: user.profile.photoMatchPref,
          highScoreOnly: user.profile.highScoreOnly,
          photos,
        }
      : null;

    return success({
      id: user.id,
      qqNumber: user.qqNumber,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      nickname: user.authIdentities[0]?.nickname ?? null,
      profile,
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

    const targetExists = await db.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!targetExists) {
      return error("NOT_FOUND", "用户不存在", 404);
    }

    const result = await deleteUsersPermanently({
      actorId: session.id,
      userIds: [id],
    });

    return success({
      message: "用户已删除",
      deletedFiles: result.deletedFileKeys.length - result.failedFileDeletes.length,
      failedFileDeletes: result.failedFileDeletes.length,
    });
  } catch (err) {
    console.error("[admin/users/:id] DELETE error:", err);
    if (err && typeof err === "object" && "status" in err) {
      const appErr = err as { code: string; message: string; status: number };
      return error(appErr.code, appErr.message, appErr.status);
    }
    return error("INTERNAL_ERROR", "服务器内部错误", 500);
  }
}
