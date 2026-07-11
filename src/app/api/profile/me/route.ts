import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { createSession } from "@/lib/session";
import { logAudit, AUDIT_ACTIONS, getClientIp } from "@/lib/audit";
import {
  profileFormSchema,
  CLEAR_COOLDOWN_DAYS,
  EDIT_COOLDOWN_DAYS,
  PHOTO_REVOKE_REPUBLISH_COOLDOWN_MS,
} from "@/lib/validations/profile";
import { success, error } from "@/lib/api-response";
import { Attribute, Prisma } from "@prisma/client";
import { notify } from "@/lib/notifications";
import { napcatClient } from "@/server/bot/clients/napcat.client";
import { buildGroupCardForProfile, normalizeNicknameInput } from "@/lib/group-card";
import { createLogger } from "@/lib/logger";
import { commitExpiredActions } from "@/lib/scoring-revocation";
import { getChinaDutyWeekday, getOnDutyScorers } from "@/lib/scorer-duty";
import { ACTIVE_SCORING_TASK_STATUSES, getScoringTaskTimeline } from "@/lib/scoring";
import {
  orderDraftPhotos,
  publishedPhotosToDraftPhotos,
  readProfileDraftData,
  toDraftJson,
} from "@/lib/profile-draft";
import { getDataDeleteCooldown } from "@/lib/user-cooldowns";
import { apiHandler } from "@/lib/api-handler";

const log = createLogger("api:profile-me");

/* ── Helpers ─────────────────────────────────────────── */

function daysSince(date: Date | null | undefined): number | null {
  if (!date) return null;
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDateString(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatCooldownRemaining(ms: number): string {
  const safeMs = Math.max(0, ms);
  if (safeMs <= 0) return "0分钟";

  const totalMinutes = Math.ceil(safeMs / (60 * 1000));
  if (totalMinutes < 60) return `${totalMinutes}分钟`;

  const totalHours = Math.ceil(safeMs / (60 * 60 * 1000));
  if (totalHours < 24) return `${totalHours}小时`;

  return `${Math.ceil(safeMs / DAY_MS)}天`;
}

function getEditCooldownInfo(
  profile:
    | {
        lastSubmittedAt: Date | null;
        draftData: unknown;
      }
    | null
    | undefined
) {
  if (!profile?.lastSubmittedAt) {
    return {
      isActive: false,
      remainingMs: 0,
      remainingDays: 0,
      remainingText: "",
      isPhotoRevokeCooldown: false,
    };
  }

  const draftData = readProfileDraftData(profile.draftData);
  const photoRevokedAt = parseDateString(draftData.photoRevokedAt);
  const isPhotoRevokeCooldown = photoRevokedAt !== null;
  const cooldownMs = isPhotoRevokeCooldown
    ? PHOTO_REVOKE_REPUBLISH_COOLDOWN_MS
    : EDIT_COOLDOWN_DAYS * DAY_MS;
  const elapsedMs = Date.now() - profile.lastSubmittedAt.getTime();
  const remainingMs = Math.max(0, cooldownMs - elapsedMs);

  return {
    isActive: remainingMs > 0,
    remainingMs,
    remainingDays: Math.ceil(remainingMs / DAY_MS),
    remainingText: formatCooldownRemaining(remainingMs),
    isPhotoRevokeCooldown,
  };
}

function resolveProfileAttribute(
  attribute: Attribute | "" | null | undefined,
  isSide?: boolean,
  isOther?: boolean
): Attribute {
  if (attribute) return attribute;
  if (isSide) return Attribute.SIDE;
  if (isOther) return Attribute.OTHER;
  return Attribute.OTHER;
}

function hasNewPhotoContent(
  publishedPhotos: Array<{ storageKey: string }>,
  desiredPhotos: Array<{ storageKey: string }>
): boolean {
  const publishedStorageKeys = new Set(publishedPhotos.map((photo) => photo.storageKey));
  return desiredPhotos.some((photo) => !publishedStorageKeys.has(photo.storageKey));
}

/**
 * GET /api/profile/me
 *
 * Fetch the current user's profile + preferences + cooldown info + rating info.
 */
export const GET = apiHandler(async () => {
  // Process any expired revocation windows first
  await commitExpiredActions();

  const session = await requireAuth();
  const isSuperAdmin = session.role === "SUPER_ADMIN";

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
  const editCooldown = getEditCooldownInfo(user?.profile);

  // hasPublishedBefore: true if the profile was ever published (lastSubmittedAt is set on publish)
  const hasPublishedBefore = user?.profile?.lastSubmittedAt != null;

  const cooldowns = isSuperAdmin
    ? {
        canPublish: true,
        publishCooldownRemaining: 0,
        canEdit: true,
        editCooldownRemaining: 0,
        editCooldownRemainingText: "",
        isPhotoRevokeCooldown: false,
        cooldownBypassed: true,
      }
    : {
        canPublish: clearDays === null || clearDays >= CLEAR_COOLDOWN_DAYS,
        publishCooldownRemaining:
          clearDays !== null && clearDays < CLEAR_COOLDOWN_DAYS
            ? CLEAR_COOLDOWN_DAYS - clearDays
            : 0,
        canEdit: !hasPublishedBefore || !editCooldown.isActive,
        editCooldownRemaining: editCooldown.remainingDays,
        editCooldownRemainingText: editCooldown.remainingText,
        isPhotoRevokeCooldown: editCooldown.isPhotoRevokeCooldown,
        cooldownBypassed: false,
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
          rankingOptIn: user.ratingProfile.rankingOptIn,
          rankingOptInUpdatedAt: user.ratingProfile.rankingOptInUpdatedAt,
        }
      : null,
  });
});

/**
 * PUT /api/profile/me
 *
 * Create or update the current user's profile + preferences.
 * Enforces cooldown rules. Auto-creates rating task for photo users.
 */
export const PUT = apiHandler(async (req) => {
  const session = await requireAuth();
  const isSuperAdmin = session.role === "SUPER_ADMIN";

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
    return error("VALIDATION_ERROR", firstError?.message || "数据验证失败", 422);
  }

  const {
    profile: profileData,
    preference: prefData,
    nickname: nicknameInput,
  } = result.data;
  const profileStatus = profileData.status || "DRAFT";
  const resolvedAttribute = resolveProfileAttribute(
    profileData.attribute,
    profileData.isSide,
    profileData.isOther
  );
  const requestedNickname =
    typeof nicknameInput === "string" ? normalizeNicknameInput(nicknameInput) : null;

  if (
    typeof nicknameInput === "string" &&
    (!requestedNickname || requestedNickname.length > 30)
  ) {
    return error("VALIDATION_ERROR", "昵称长度需在 1-30 个字符之间", 422);
  }

  // 3. Fetch user for cooldown checks
  const user = await db.user.findUnique({
    where: { id: session.id },
    include: {
      profile: {
        include: {
          photos: { orderBy: { order: "asc" } },
        },
      },
      ratingProfile: true,
    },
  });

  if (!isSuperAdmin) {
    const dataDeleteCooldown = getDataDeleteCooldown(user?.lastProfileClearedAt);
    if (dataDeleteCooldown) {
      return error(
        "COOLDOWN",
        `删除数据冷却期间不能修改资料。还需等待 ${dataDeleteCooldown.remainingText}。`,
        429
      );
    }
  }

  // ─── DRAFT SAVE FOR ACTIVE PROFILES → store in draftData, don't touch published ───
  if (profileStatus === "DRAFT" && user?.profile?.status === "ACTIVE") {
    const existingDraft = readProfileDraftData(user.profile.draftData);
    const deleteAllPhotos =
      body.deleteAllPhotos ?? existingDraft.deleteAllPhotos ?? false;

    // Store draft data without modifying published profile fields or photos.
    const draftPayload = {
      ...existingDraft,
      profile: body.profile as Prisma.InputJsonValue,
      preference: body.preference as Prisma.InputJsonValue,
      deleteAllPhotos,
      photos: deleteAllPhotos ? [] : existingDraft.photos,
    };

    await db.profile.update({
      where: { userId: session.id },
      data: { draftData: toDraftJson(draftPayload) },
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
  if (!isSuperAdmin && profileStatus === "ACTIVE" && user?.profile?.lastSubmittedAt) {
    const editCooldown = getEditCooldownInfo(user.profile);
    if (editCooldown.isActive) {
      const cooldownLabel = editCooldown.isPhotoRevokeCooldown
        ? "照片撤销后"
        : `发布后 ${EDIT_COOLDOWN_DAYS} 天内`;
      return error(
        "COOLDOWN",
        `${cooldownLabel}不能再次发布。还需等待 ${editCooldown.remainingText}。`,
        429
      );
    }
  }

  // 3b. Check 30-day clear cooldown (only blocks ACTIVE publish)
  if (!isSuperAdmin && profileStatus === "ACTIVE" && user?.lastProfileClearedAt) {
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
    attribute: resolvedAttribute,
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
    ...(profileData.photoMatchPref ? {} : { matchPrefUpdatedAt: null }),
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

  // 6. Apply draft photo changes only when publishing.
  let photoChangeRequiresScoring = false;

  if (profileStatus === "ACTIVE") {
    const existingDraft = readProfileDraftData(user?.profile?.draftData);
    const shouldApplyDraftPhotos =
      user?.profile?.status === "ACTIVE" &&
      (existingDraft.photos !== undefined ||
        existingDraft.deleteAllPhotos ||
        body.deleteAllPhotos);

    if (shouldApplyDraftPhotos) {
      const currentPhotos = await db.profilePhoto.findMany({
        where: { profileId: profile.id },
        orderBy: { order: "asc" },
      });
      const desiredPhotos = orderDraftPhotos(
        body.deleteAllPhotos
          ? []
          : (existingDraft.photos ??
              publishedPhotosToDraftPhotos(user?.profile?.photos ?? []))
      );
      photoChangeRequiresScoring = hasNewPhotoContent(
        user?.profile?.photos ?? [],
        desiredPhotos
      );
      const desiredStorageKeys = new Set(desiredPhotos.map((p) => p.storageKey));
      const candidateDeleteKeys = new Set([
        ...currentPhotos.map((p) => p.storageKey),
        ...(existingDraft.photos ?? [])
          .filter((p) => p.source === "draft")
          .map((p) => p.storageKey),
      ]);

      const { deleteFile: deleteStorageFile } = await import("@/lib/storage");
      await Promise.all(
        [...candidateDeleteKeys]
          .filter((key) => !desiredStorageKeys.has(key))
          .map((key) => deleteStorageFile(key).catch(() => {}))
      );

      await db.$transaction([
        db.profilePhoto.deleteMany({ where: { profileId: profile.id } }),
        ...desiredPhotos.map((photo, index) =>
          db.profilePhoto.create({
            data: {
              profileId: profile.id,
              storageKey: photo.storageKey,
              order: index,
              originalName: photo.originalName,
              mimeType: photo.mimeType,
              sizeBytes: photo.sizeBytes,
            },
          })
        ),
      ]);
    } else if (body.deleteAllPhotos) {
      const photosToDelete = await db.profilePhoto.findMany({
        where: { profileId: profile.id },
        select: { storageKey: true },
      });

      const { deleteFile: deleteStorageFile } = await import("@/lib/storage");
      await Promise.all(
        photosToDelete.map((p) => deleteStorageFile(p.storageKey).catch(() => {}))
      );

      await db.profilePhoto.deleteMany({ where: { profileId: profile.id } });
    }
  }

  // 7. Auto-create rating task for photo users publishing as ACTIVE
  if (profileStatus === "ACTIVE") {
    const photoCount = await db.profilePhoto.count({
      where: { profileId: profile.id },
    });

    if (photoCount > 0) {
      const isFirstActivePublish = user?.profile?.status !== "ACTIVE";
      const needsInitialScoring =
        !user?.ratingProfile || user.ratingProfile.ratingStatus === "NOT_SUBMITTED";
      const shouldQueueScoring =
        isFirstActivePublish || photoChangeRequiresScoring || needsInitialScoring;

      if (shouldQueueScoring) {
        // Check if there's already a pending/scoring task
        const existingTask = await db.ratingTask.findFirst({
          where: {
            ratedUserId: session.id,
            status: { in: [...ACTIVE_SCORING_TASK_STATUSES] },
          },
        });

        if (!existingTask) {
          const taskCreatedAt = new Date();
          const timeline = getScoringTaskTimeline(taskCreatedAt);
          const scorers = await getOnDutyScorers({
            excludeUserId: session.id,
            weekday: getChinaDutyWeekday(timeline.publishAt),
          });

          const firstPhoto = await db.profilePhoto.findFirst({
            where: { profileId: profile.id },
            orderBy: { order: "asc" },
          });

          if (firstPhoto) {
            const ratingTask = await db.ratingTask.create({
              data: {
                ratedUserId: session.id,
                photoObjectKey: firstPhoto.storageKey,
                status: "PENDING",
                scorerSnapshot: scorers.map((s) => s.id),
                createdAt: taskCreatedAt,
              },
            });

            // Upsert RatingProfile
            await db.ratingProfile.upsert({
              where: { userId: session.id },
              create: {
                userId: session.id,
                ratingStatus: "PENDING",
                finalScore: null,
                scoreCompletedAt: null,
              },
              update: {
                ratingStatus: "PENDING",
                finalScore: null,
                scoreCompletedAt: null,
              },
            });

            // Count how many users are ahead in the scoring queue
            const queueAhead = await db.ratingTask.count({
              where: {
                status: { in: ["PENDING", "SCORING"] },
                ratedUserId: { not: session.id },
                createdAt: { lt: ratingTask.createdAt },
              },
            });
            await notify.scoringQueued(session.id, queueAhead, timeline);
          }
        }
      }
    } else {
      // No photos — delete any pending/scoring rating tasks and clean up RatingProfile
      // Scores are cascade-deleted via onDelete: Cascade
      await db.ratingTask.deleteMany({
        where: {
          ratedUserId: session.id,
          status: { in: [...ACTIVE_SCORING_TASK_STATUSES] },
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

      const nickname =
        requestedNickname ?? normalizeNicknameInput(identity?.nickname || "");

      if (nickname) {
        const groupCard = buildGroupCardForProfile(nickname, profileData);

        await db.authIdentity.updateMany({
          where: { userId: session.id },
          data: { nickname },
        });

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
            data: { qqNickname: nickname, groupCard },
          });
        } catch {
          // BotIdentity may not exist — non-critical
        }
      }
    } catch (err) {
      // Group card sync is best-effort, don't fail the request
      log.warn(
        { err, qqNumber: session.qqNumber },
        "Failed to sync group card after profile update"
      );
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
  await createSession(session.id, session.role, true, {
    sessionId: session.sessionId,
  });

  return success({ profile, preference });
});

/**
 * DELETE /api/profile/me
 *
 * Discard saved draft data. Only clears the draftData column.
 */
export const DELETE = apiHandler(async () => {
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
});
