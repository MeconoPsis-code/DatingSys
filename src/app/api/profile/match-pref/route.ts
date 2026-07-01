import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { success, error } from "@/lib/api-response";
import {
  MATCH_PREF_COOLDOWN_MS,
  formatMatchPrefCooldownRemaining,
  getMatchPrefCooldown,
} from "@/lib/match-pref-cooldown";

type PhotoMatchPrefValue = "ALL" | "PHOTO_ONLY";

const VALID_PHOTO_MATCH_PREFS = new Set<string>(["ALL", "PHOTO_ONLY"]);

function toMatchPrefSettings(profile: {
  photoMatchPref: PhotoMatchPrefValue | null;
  highScoreOnly: boolean;
  matchPrefUpdatedAt: Date | null;
}) {
  return {
    photoMatchPref: profile.photoMatchPref,
    highScoreOnly: profile.photoMatchPref === "PHOTO_ONLY" && profile.highScoreOnly,
    matchPrefUpdatedAt: profile.matchPrefUpdatedAt,
    matchPrefCooldownEndsAt: getMatchPrefCooldown(profile.matchPrefUpdatedAt)
      .nextChangeAt,
  };
}

function hasSamePreference(
  profile: {
    photoMatchPref: PhotoMatchPrefValue | null;
    highScoreOnly: boolean;
  },
  nextPhotoMatchPref: PhotoMatchPrefValue,
  nextHighScoreOnly: boolean
) {
  const currentHighScoreOnly =
    profile.photoMatchPref === "PHOTO_ONLY" && profile.highScoreOnly;

  return (
    profile.photoMatchPref === nextPhotoMatchPref &&
    currentHighScoreOnly === nextHighScoreOnly
  );
}

/**
 * PUT /api/profile/match-pref
 *
 * Update the user's photo-matching preferences after scoring is complete.
 * Body: { photoMatchPref: 'ALL' | 'PHOTO_ONLY', highScoreOnly?: boolean }
 */
export async function PUT(req: Request) {
  try {
    const session = await requireAuth();

    let body: { photoMatchPref?: string; highScoreOnly?: boolean };
    try {
      body = await req.json();
    } catch {
      return error("VALIDATION_ERROR", "无效的请求体", 422);
    }

    const { photoMatchPref, highScoreOnly } = body;

    if (!photoMatchPref || !VALID_PHOTO_MATCH_PREFS.has(photoMatchPref)) {
      return error("VALIDATION_ERROR", "请选择有效的匹配偏好", 422);
    }

    if (highScoreOnly && photoMatchPref !== "PHOTO_ONLY") {
      return error(
        "VALIDATION_ERROR",
        "仅在选择「仅与有照片用户匹配」时可启用高分筛选",
        422
      );
    }

    const nextPhotoMatchPref = photoMatchPref as PhotoMatchPrefValue;
    const nextHighScoreOnly =
      nextPhotoMatchPref === "PHOTO_ONLY" && highScoreOnly === true;

    const user = await db.user.findUnique({
      where: { id: session.id },
      include: {
        profile: {
          include: {
            photos: { select: { id: true }, take: 1 },
          },
        },
        ratingProfile: true,
      },
    });

    if (!user?.profile) {
      return error("NOT_FOUND", "请先完成个人资料", 404);
    }

    if (!user.profile.photos || user.profile.photos.length === 0) {
      return error("VALIDATION_ERROR", "请先上传照片", 422);
    }

    if (
      !user.ratingProfile ||
      user.ratingProfile.ratingStatus !== "COMPLETED"
    ) {
      return error("RATING_INCOMPLETE", "评分尚未完成，请耐心等待", 403);
    }

    if (nextHighScoreOnly) {
      const score = user.ratingProfile.finalScore ?? 0;
      if (score < 7.0) {
        return error(
          "VALIDATION_ERROR",
          "仅评分 ≥ 7.0 的用户可启用高分筛选",
          422
        );
      }
    }

    if (
      hasSamePreference(user.profile, nextPhotoMatchPref, nextHighScoreOnly)
    ) {
      return success(toMatchPrefSettings(user.profile));
    }

    const cooldown = getMatchPrefCooldown(user.profile.matchPrefUpdatedAt);
    if (cooldown.isActive) {
      return error(
        "COOLDOWN_ACTIVE",
        `匹配偏好设置每天只能修改一次，还需等待 ${formatMatchPrefCooldownRemaining(cooldown.remainingMs)}。`,
        429
      );
    }

    const now = new Date();
    const cooldownCutoff = new Date(now.getTime() - MATCH_PREF_COOLDOWN_MS);

    const updateResult = await db.profile.updateMany({
      where: {
        userId: session.id,
        OR: [
          { photoMatchPref: null },
          { matchPrefUpdatedAt: null },
          { matchPrefUpdatedAt: { lte: cooldownCutoff } },
        ],
      },
      data: {
        photoMatchPref: nextPhotoMatchPref,
        highScoreOnly: nextHighScoreOnly,
        matchPrefUpdatedAt: now,
      },
    });

    const updatedProfile = await db.profile.findUnique({
      where: { userId: session.id },
      select: {
        photoMatchPref: true,
        highScoreOnly: true,
        matchPrefUpdatedAt: true,
      },
    });

    if (!updatedProfile) {
      return error("NOT_FOUND", "请先完成个人资料", 404);
    }

    if (updateResult.count === 0) {
      if (
        hasSamePreference(
          updatedProfile,
          nextPhotoMatchPref,
          nextHighScoreOnly
        )
      ) {
        return success(toMatchPrefSettings(updatedProfile));
      }

      const latestCooldown = getMatchPrefCooldown(
        updatedProfile.matchPrefUpdatedAt
      );
      return error(
        "COOLDOWN_ACTIVE",
        `匹配偏好设置每天只能修改一次，还需等待 ${formatMatchPrefCooldownRemaining(latestCooldown.remainingMs)}。`,
        429
      );
    }

    return success(toMatchPrefSettings(updatedProfile));
  } catch (err) {
    console.error("[profile/match-pref] PUT error:", err);
    if (err && typeof err === "object" && "status" in err) {
      const appErr = err as { code: string; message: string; status: number };
      return error(appErr.code, appErr.message, appErr.status);
    }
    return error("INTERNAL_ERROR", "服务器内部错误", 500);
  }
}
