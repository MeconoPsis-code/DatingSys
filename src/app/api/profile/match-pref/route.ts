import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { success, error } from "@/lib/api-response";

/**
 * PUT /api/profile/match-pref
 *
 * Update the user's photo-matching preferences after scoring is complete.
 * Body: { photoMatchPref: 'ALL' | 'PHOTO_ONLY', highScoreOnly?: boolean }
 */
export async function PUT(req: Request) {
  const session = await requireAuth();

  // 1. Parse body
  let body: { photoMatchPref?: string; highScoreOnly?: boolean };
  try {
    body = await req.json();
  } catch {
    return error("VALIDATION_ERROR", "无效的请求体", 422);
  }

  const { photoMatchPref, highScoreOnly } = body;

  // 2. Validate photoMatchPref value
  if (!photoMatchPref || !["ALL", "PHOTO_ONLY"].includes(photoMatchPref)) {
    return error("VALIDATION_ERROR", "请选择有效的匹配偏好", 422);
  }

  // 3. highScoreOnly is only valid when PHOTO_ONLY
  if (highScoreOnly && photoMatchPref !== "PHOTO_ONLY") {
    return error(
      "VALIDATION_ERROR",
      "仅在选择「仅与有照片用户匹配」时可启用高分筛选",
      422
    );
  }

  // 4. Fetch user profile + rating to verify eligibility
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

  // Must have photos
  if (!user.profile.photos || user.profile.photos.length === 0) {
    return error("VALIDATION_ERROR", "请先上传照片", 422);
  }

  // Scoring must be completed
  if (
    !user.ratingProfile ||
    user.ratingProfile.ratingStatus !== "COMPLETED"
  ) {
    return error("RATING_INCOMPLETE", "评分尚未完成，请耐心等待", 403);
  }

  // highScoreOnly requires finalScore >= 7.0
  if (highScoreOnly) {
    const score = user.ratingProfile.finalScore ?? 0;
    if (score < 7.0) {
      return error(
        "VALIDATION_ERROR",
        "仅评分 ≥ 7.0 的用户可启用高分筛选",
        422
      );
    }
  }

  // 5. Update profile
  const updatedProfile = await db.profile.update({
    where: { userId: session.id },
    data: {
      photoMatchPref: photoMatchPref as "ALL" | "PHOTO_ONLY",
      highScoreOnly: photoMatchPref === "PHOTO_ONLY" && highScoreOnly === true,
    },
  });

  return success({
    photoMatchPref: updatedProfile.photoMatchPref,
    highScoreOnly: updatedProfile.highScoreOnly,
  });
}
