import { Prisma } from "@prisma/client";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { error, success } from "@/lib/api-response";
import { getClientIp } from "@/lib/audit";
import { readProfileDraftData, toDraftJson } from "@/lib/profile-draft";
import {
  COOLDOWN_CONFIRM_TEXT,
  buildActiveUserCooldowns,
  isUserCooldownType,
} from "@/lib/user-cooldowns";
import type { ProfileDraftData } from "@/lib/profile-draft";

// ── POST /api/admin/users/:id/cooldown ─────────────────

function stripPhotoRevokeMarker(draftData: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  const draft = readProfileDraftData(draftData);
  const nextDraft: ProfileDraftData = {};

  if (draft.profile !== undefined) nextDraft.profile = draft.profile;
  if (draft.preference !== undefined) nextDraft.preference = draft.preference;
  if (draft.deleteAllPhotos === true) nextDraft.deleteAllPhotos = true;
  if (draft.photos !== undefined) nextDraft.photos = draft.photos;

  if (
    nextDraft.profile === undefined &&
    nextDraft.preference === undefined &&
    nextDraft.deleteAllPhotos === undefined &&
    nextDraft.photos === undefined
  ) {
    return Prisma.DbNull;
  }

  return toDraftJson(nextDraft);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireRole("SUPER_ADMIN");
    const { id } = await params;

    const body = await req.json();
    const { type, confirmation, reason } = body as {
      type?: string;
      confirmation?: string;
      reason?: string;
    };

    if (!type || !isUserCooldownType(type)) {
      return error("INVALID_COOLDOWN_TYPE", "请选择有效的冷却类型", 400);
    }

    if (confirmation !== COOLDOWN_CONFIRM_TEXT) {
      return error("INVALID_CONFIRMATION", `请输入「${COOLDOWN_CONFIRM_TEXT}」以确认解除`, 400);
    }

    const trimmedReason = reason?.trim();
    if (!trimmedReason) {
      return error("MISSING_REASON", "请填写解除原因或备注", 400);
    }

    const user = await db.user.findUnique({
      where: { id },
      include: {
        authIdentities: { select: { nickname: true }, take: 1 },
        profile: {
          select: {
            id: true,
            lastSubmittedAt: true,
            matchPrefUpdatedAt: true,
            draftData: true,
          },
        },
        auditLogs: {
          where: { action: "ACCOUNT_DELETE_REQUEST" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true },
        },
      },
    });

    if (!user) {
      return error("NOT_FOUND", "用户不存在", 404);
    }

    const activeCooldown = buildActiveUserCooldowns({
      status: user.status,
      updatedAt: user.updatedAt,
      lastProfileClearedAt: user.lastProfileClearedAt,
      profile: user.profile,
      accountDeleteRequestedAt: user.auditLogs[0]?.createdAt ?? null,
    }).find((cooldown) => cooldown.type === type);

    if (!activeCooldown) {
      return error("COOLDOWN_NOT_ACTIVE", "该用户当前不存在此冷却限制", 409);
    }

    const auditMetadata = {
      reason: trimmedReason,
      cooldownType: activeCooldown.type,
      cooldownLabel: activeCooldown.label,
      cooldownSource: activeCooldown.source,
      startedAt: activeCooldown.startedAt.toISOString(),
      endsAt: activeCooldown.endsAt.toISOString(),
      remainingMs: activeCooldown.remainingMs,
      remainingText: activeCooldown.remainingText,
      targetSnapshot: {
        userId: user.id,
        qqNumber: user.qqNumber,
        nickname: user.authIdentities[0]?.nickname ?? null,
      },
    } satisfies Prisma.InputJsonObject;

    const auditLog = db.auditLog.create({
      data: {
        actorUserId: session.id,
        action: "ADMIN_COOLDOWN_RELEASE",
        targetType: "User",
        targetId: user.id,
        metadata: auditMetadata,
        ip: getClientIp(req),
        userAgent: req.headers.get("user-agent"),
      },
    });

    if (type === "PROFILE_EDIT") {
      if (!user.profile) {
        return error("NOT_FOUND", "用户资料不存在", 404);
      }

      await db.$transaction([
        db.profile.update({
          where: { id: user.profile.id },
          data: {
            lastSubmittedAt: null,
            draftData: stripPhotoRevokeMarker(user.profile.draftData),
          },
        }),
        auditLog,
      ]);
    } else if (type === "MATCH_POOL") {
      if (!user.profile) {
        return error("NOT_FOUND", "用户资料不存在", 404);
      }

      await db.$transaction([
        db.profile.update({
          where: { id: user.profile.id },
          data: { matchPrefUpdatedAt: null },
        }),
        auditLog,
      ]);
    } else if (activeCooldown.source === "ACCOUNT_DELETE") {
      await db.$transaction([
        db.user.update({
          where: { id: user.id },
          data: { status: "ACTIVE" },
        }),
        auditLog,
      ]);
    } else {
      await db.$transaction([
        db.user.update({
          where: { id: user.id },
          data: { lastProfileClearedAt: null },
        }),
        auditLog,
      ]);
    }

    return success({
      message: `${activeCooldown.label}已解除`,
      cooldownType: activeCooldown.type,
    });
  } catch (err) {
    console.error("[admin/users/:id/cooldown] POST error:", err);
    if (err && typeof err === "object" && "status" in err) {
      const appErr = err as { code: string; message: string; status: number };
      return error(appErr.code, appErr.message, appErr.status);
    }
    return error("INTERNAL_ERROR", "服务器内部错误", 500);
  }
}
