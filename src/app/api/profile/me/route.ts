import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { createSession } from "@/lib/session";
import { logAudit, AUDIT_ACTIONS, getClientIp } from "@/lib/audit";
import {
  profileFormSchema,
  CLEAR_COOLDOWN_DAYS,
  EDIT_COOLDOWN_DAYS,
} from "@/lib/validations/profile";
import { success, error } from "@/lib/api-response";
import { Prisma } from "@prisma/client";
import { notify } from "@/lib/notifications";
import { napcatClient } from "@/server/bot/clients/napcat.client";
import {
  buildGroupCardForProfile,
  normalizeNicknameInput,
} from "@/lib/group-card";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:profile-me");
import { commitExpiredActions } from "@/lib/scoring-revocation";

/* ── Helpers ─────────────────────────────────────────── */

function daysSince(date: Date | null | undefined): number | null {
  if (!date) return null;
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * GET /api/profile/me
 *
 * Fetch the current user's profile + preferences + cooldown info + rating info.
 */
export async function GET() {
  // Process any expired revocation windows first
  await commitExpiredActions();

  const session = await requireAuth();

  const user = await db.user.findUnique({
    where: { id: session.id },
    include: {
      profile: {
        include: {
          photos: { orderBy: { order: "asc" }, select: { id: true } },
        },
      },
      preference: true,
      ratingProfile: true,
    },
  });

  // Calculate cooldown info for the UI
  const clearDays = daysSince(user?.lastProfileClearedAt);
  const editDays = daysSince(user?.profile?.lastSubmittedAt);

  // hasPublishedBefore: true if the profile was ever published (lastSubmittedAt is set on publish)
  const hasPublishedBefore = user?.profile?.lastSubmittedAt != null;

  const cooldowns = {
    canPublish:
      clearDays === null || clearDays >= CLEAR_COOLDOWN_DAYS,
    publishCooldownRemaining:
      clearDays !== null && clearDays < CLEAR_COOLDOWN_DAYS
        ? CLEAR_COOLDOWN_DAYS - clearDays
        : 0,
    canEdit:
      !hasPublishedBefore || editDays === null || editDays >= EDIT_COOLDOWN_DAYS,
    editCooldownRemaining:
      hasPublishedBefore && editDays !== null && editDays < EDIT_COOLDOWN_DAYS
        ? EDIT_COOLDOWN_DAYS - editDays
        : 0,
  };

  const hasPhotos = (user?.profile?.photos?.length ?? 0) > 0;

  return success({
    profile: user?.profile ?? null,
    preference: user?.preference ?? null,
    cooldowns,
    hasPhotos,
    ratingProfile: user?.ratingProfile
      ? {
          ratingStatus: user.ratingProfile.ratingStatus,
          finalScore: user.ratingProfile.finalScore,
          scoreCompletedAt: user.ratingProfile.scoreCompletedAt,
        }
      : null,
  });
}

/**
 * PUT /api/profile/me
 *
 * Create or update the current user's profile + preferences.
 * Enforces cooldown rules. Auto-creates rating task for photo users.
 */
export async function PUT(req: Request) {
  const session = await requireAuth();

  // 1. Parse body
  let body;
  try {
    body = await req.json();
  } catch {
    return error("VALIDATION_ERROR", "无效的请求体", 422);
  }

  // 2. Validate with Zod
  const result = profileFormSchema.safeParse(body);
  if (!result.success) {
    const firstError = result.error.issues[0];
    return error(
      "VALIDATION_ERROR",
      firstError?.message || "数据验证失败",
      422
    );
  }

  const { profile: profileData, preference: prefData } = result.data;
  const profileStatus = profileData.status || "DRAFT";

  // 3. Fetch user for cooldown checks
  const user = await db.user.findUnique({
    where: { id: session.id },
    include: { profile: true },
  });

  // ─── DRAFT SAVE FOR ACTIVE PROFILES → store in draftData, don't touch published ───
  if (profileStatus === "DRAFT" && user?.profile?.status === "ACTIVE") {
    // Store the entire form body as draft data without modifying published profile
    const draftPayload = {
      profile: body.profile,
      preference: body.preference,
      deleteAllPhotos: body.deleteAllPhotos ?? false,
    };

    await db.profile.update({
      where: { userId: session.id },
      data: { draftData: draftPayload as Prisma.InputJsonValue },
    });

    await logAudit({
      actorId: session.id,
      action: AUDIT_ACTIONS.PROFILE_UPDATE,
      targetType: "Profile",
      targetId: user.profile.id,
      metadata: { status: "DRAFT_SAVED" } as Prisma.InputJsonValue,
      ip: getClientIp(req),
      userAgent: req.headers.get("user-agent"),
    });

    return success({
      profile: user.profile,
      preference: await db.preference.findUnique({ where: { userId: session.id } }),
      draftSaved: true,
    });
  }

  // 3a. Check 7-day edit cooldown (blocks re-publishing if previously published within cooldown)
  if (
    profileStatus === "ACTIVE" &&
    user?.profile?.lastSubmittedAt
  ) {
    const editDays = daysSince(user.profile.lastSubmittedAt);
    if (editDays !== null && editDays < EDIT_COOLDOWN_DAYS) {
      const remaining = EDIT_COOLDOWN_DAYS - editDays;
      return error(
        "COOLDOWN",
        `发布后 ${EDIT_COOLDOWN_DAYS} 天内不能再次发布。还需等待 ${remaining} 天。`,
        429
      );
    }
  }

  // 3b. Check 30-day clear cooldown (only blocks ACTIVE publish)
  if (profileStatus === "ACTIVE" && user?.lastProfileClearedAt) {
    const clearDays = daysSince(user.lastProfileClearedAt);
    if (clearDays !== null && clearDays < CLEAR_COOLDOWN_DAYS) {
      const remaining = CLEAR_COOLDOWN_DAYS - clearDays;
      return error(
        "COOLDOWN",
        `清空资料后 ${CLEAR_COOLDOWN_DAYS} 天内不能发布。还需等待 ${remaining} 天。`,
        429
      );
    }
  }

  // 4. Build profile data (no poolType — single pool)
  const profileFields = {
    birthDate: profileData.birthDate,
    heightCm: profileData.heightCm,
    weightKg: profileData.weightKg,
    provinceCode: profileData.provinceCode,
    cityCode: profileData.cityCode,
    locationType: profileData.locationType,
    attribute: profileData.attribute,
    isSide: profileData.isSide ?? false,
    isOther: profileData.isOther ?? false,
    customAttribute: profileData.customAttribute ?? null,
    mbti: profileData.mbti || null,
    selfIntro: profileData.selfIntro ?? null,
    consentProfileVisibility: profileData.consentProfileVisibility,
    status: profileStatus,
    lastSubmittedAt: profileStatus === "ACTIVE" ? new Date() : undefined,
    photoMatchPref: profileData.photoMatchPref ?? null,
    highScoreOnly: profileData.highScoreOnly ?? false,
    // Clear draft data when publishing
    ...(profileStatus === "ACTIVE" ? { draftData: Prisma.DbNull } : {}),
  };

  const prefFields = {
    ageMin: prefData.ageMin,
    ageMax: prefData.ageMax,
    heightMinCm: prefData.heightMinCm,
    heightMaxCm: prefData.heightMaxCm,
    weightMinKg: prefData.weightMinKg,
    weightMaxKg: prefData.weightMaxKg,
    expectedAttributes: prefData.expectedAttributes as unknown as Prisma.InputJsonValue,
    expectedCustomAttribute: prefData.expectedCustomAttribute ?? null,
  };

  // 5. Upsert in transaction
  const [profile, preference] = await db.$transaction([
    db.profile.upsert({
      where: { userId: session.id },
      create: { userId: session.id, ...profileFields },
      update: profileFields,
    }),
    db.preference.upsert({
      where: { userId: session.id },
      create: { userId: session.id, ...prefFields },
      update: prefFields,
    }),
  ]);

  // 6. Handle photo deletion if requested (only allowed through publish flow)
  if (body.deleteAllPhotos && profileStatus === "ACTIVE") {
    const photosToDelete = await db.profilePhoto.findMany({
      where: { profileId: profile.id },
      select: { id: true, storageKey: true },
    });

    // Delete from storage
    const { deleteFile: deleteStorageFile } = await import("@/lib/storage");
    await Promise.all(
      photosToDelete.map((p) => deleteStorageFile(p.storageKey).catch(() => {}))
    );

    // Delete from DB
    await db.profilePhoto.deleteMany({ where: { profileId: profile.id } });
  }

  // 7. Auto-create rating task for photo users publishing as ACTIVE
  if (profileStatus === "ACTIVE") {
    const photoCount = await db.profilePhoto.count({
      where: { profileId: profile.id },
    });

    if (photoCount > 0) {
      // Check if there's already a pending/scoring task
      const existingTask = await db.ratingTask.findFirst({
        where: {
          ratedUserId: session.id,
          status: { in: ["PENDING", "SCORING"] },
        },
      });

      if (!existingTask) {
        // Get all eligible scorers
        const scorers = await db.user.findMany({
          where: {
            role: { in: ["SCORER", "ADMIN"] },
            id: { not: session.id }, // can't score yourself
          },
          select: { id: true },
        });

        if (scorers.length > 0) {
          const firstPhoto = await db.profilePhoto.findFirst({
            where: { profileId: profile.id },
            orderBy: { order: "asc" },
          });

          await db.ratingTask.create({
            data: {
              ratedUserId: session.id,
              photoObjectKey: firstPhoto!.storageKey,
              status: "PENDING",
              scorerSnapshot: scorers.map((s) => s.id),
            },
          });

          // Upsert RatingProfile
          await db.ratingProfile.upsert({
            where: { userId: session.id },
            create: {
              userId: session.id,
              ratingStatus: "PENDING",
            },
            update: {
              ratingStatus: "PENDING",
            },
          });

          // Count how many users are ahead in the scoring queue
          const queueAhead = await db.ratingTask.count({
            where: {
              status: { in: ["PENDING", "SCORING"] },
              ratedUserId: { not: session.id },
              createdAt: { lt: new Date() },
            },
          });
          await notify.scoringQueued(session.id, queueAhead);
        }
      }
    } else {
      // No photos — delete any pending/scoring rating tasks and clean up RatingProfile
      // Scores are cascade-deleted via onDelete: Cascade
      await db.ratingTask.deleteMany({
        where: {
          ratedUserId: session.id,
          status: { in: ["PENDING", "SCORING"] },
        },
      });

      // Remove rating profile so user is no longer shown as 待评分
      await db.ratingProfile.deleteMany({
        where: { userId: session.id },
      });
    }
  }

  // 7. Sync QQ group card in "age-city-nickname" format
  if (session.qqNumber) {
    try {
      // Get user's nickname from AuthIdentity
      const identity = await db.authIdentity.findFirst({
        where: { userId: session.id },
        select: { nickname: true },
      });

      const nickname = normalizeNicknameInput(identity?.nickname || "");

      if (nickname) {
        const groupCard = buildGroupCardForProfile(nickname, profileData);

        if (identity?.nickname && identity.nickname !== nickname) {
          await db.authIdentity.updateMany({
            where: { userId: session.id },
            data: { nickname },
          });
        }

        // Find group membership
        const membership = await db.groupMembership.findUnique({
          where: { userId: session.id },
          select: { groupId: true },
        });

        if (membership && membership.groupId && membership.groupId !== "default") {
          await napcatClient.setGroupCard(
            membership.groupId,
            session.qqNumber,
            groupCard
          );
          log.info(
            { qqNumber: session.qqNumber, groupCard },
            "Group card synced after profile update"
          );
        }

        // Update BotIdentity
        try {
          await db.botIdentity.update({
            where: { qqNumber: session.qqNumber },
            data: { groupCard },
          });
        } catch {
          // BotIdentity may not exist — non-critical
        }
      }
    } catch (err) {
      // Group card sync is best-effort, don't fail the request
      log.warn({ err, qqNumber: session.qqNumber }, "Failed to sync group card after profile update");
    }
  }

  // 8. Audit log
  await logAudit({
    actorId: session.id,
    action: AUDIT_ACTIONS.PROFILE_UPDATE,
    targetType: "Profile",
    targetId: profile.id,
    metadata: { status: profileStatus } as Prisma.InputJsonValue,
    ip: getClientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  // 9. Refresh session JWT with hasProfile=true so middleware stops redirecting
  await createSession(session.id, session.role, true);

  return success({ profile, preference });
}

/**
 * DELETE /api/profile/me
 *
 * Discard saved draft data. Only clears the draftData column.
 */
export async function DELETE() {
  const session = await requireAuth();

  const profile = await db.profile.findUnique({
    where: { userId: session.id },
  });

  if (!profile || !profile.draftData) {
    return error("NOT_FOUND", "没有待处理的草稿", 404);
  }

  await db.profile.update({
    where: { userId: session.id },
    data: { draftData: Prisma.DbNull },
  });

  return success({ message: "草稿已丢弃" });
}
