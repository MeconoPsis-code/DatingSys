import { requireAuth } from '@/lib/auth';
import { db } from '@/lib/db';
import { success, error, paginated } from '@/lib/api-response';
import { NextResponse } from 'next/server';
import {
  getMatchType,
  computeRelevanceScore,
  type MatchCandidate,
} from '@/lib/matching';

// ── Helpers ─────────────────────────────────────────────

function ageFromDate(bd: Date): number {
  const today = new Date();
  let age = today.getFullYear() - bd.getFullYear();
  const m = today.getMonth() - bd.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) age--;
  return age;
}

function getAgeRange(age: number): string {
  if (age <= 22) return '18-22';
  if (age <= 27) return '23-27';
  if (age <= 32) return '28-32';
  if (age <= 37) return '33-37';
  return '38+';
}

function getHeightRange(cm: number): string {
  if (cm < 160) return '<160';
  if (cm <= 165) return '160-165';
  if (cm <= 170) return '165-170';
  if (cm <= 175) return '170-175';
  if (cm <= 180) return '175-180';
  if (cm <= 185) return '180-185';
  return '185+';
}

// ── GET /api/matches ────────────────────────────────────

export async function GET(req: Request) {
  try {
    const session = await requireAuth();

    // 1. Load current user's profile + preference
    const profile = await db.profile.findUnique({
      where: { userId: session.id },
      include: { photos: { select: { id: true } } },
    });
    const preference = await db.preference.findUnique({
      where: { userId: session.id },
    });

    // 2. Must have an active profile
    if (!profile || profile.status !== 'ACTIVE' || !preference) {
      return error('NO_PROFILE', '请先完善并发布资料', 400);
    }

    // 3. Load the user's RatingProfile
    const ratingProfile = await db.ratingProfile.findUnique({
      where: { userId: session.id },
    });

    // 4. Scoring-pending guard
    if (
      profile.photos.length > 0 &&
      ratingProfile &&
      (ratingProfile.ratingStatus === 'PENDING' ||
        ratingProfile.ratingStatus === 'SCORING' ||
        ratingProfile.ratingStatus === 'REVIEW')
    ) {
      return success({
        status: 'scoring_pending',
        message: '评分中，请耐心等待',
      });
    }

    // 4b. Match-preference-pending guard: scored photo users must select preference first
    if (
      profile.photos.length > 0 &&
      ratingProfile &&
      ratingProfile.ratingStatus === 'COMPLETED' &&
      !profile.photoMatchPref
    ) {
      return success({
        status: 'preference_pending',
        message: '评分已完成，请先设置匹配偏好',
        finalScore: ratingProfile.finalScore,
      });
    }

    // 5. Load ALL other active users with profiles
    const candidates = await db.user.findMany({
      where: {
        id: { not: session.id },
        status: 'ACTIVE',
        profile: { status: 'ACTIVE' },
      },
      include: {
        profile: { include: { photos: { select: { id: true } } } },
        preference: true,
        ratingProfile: true,
        authIdentities: { select: { nickname: true }, take: 1 },
      },
    });

    // 6. Build currentUser MatchCandidate
    const currentUser: MatchCandidate = {
      userId: session.id,
      profile: {
        birthDate: profile.birthDate,
        heightCm: profile.heightCm,
        weightKg: profile.weightKg,
        provinceCode: profile.provinceCode,
        cityCode: profile.cityCode,
        attribute: profile.attribute,
        status: profile.status,
        photoMatchPref: profile.photoMatchPref,
        highScoreOnly: profile.highScoreOnly,
      },
      preference: {
        ageMin: preference.ageMin,
        ageMax: preference.ageMax,
        heightMinCm: preference.heightMinCm,
        heightMaxCm: preference.heightMaxCm,
        weightMinKg: preference.weightMinKg,
        weightMaxKg: preference.weightMaxKg,
        expectedAttributes: preference.expectedAttributes as string[],
      },
      hasPhotos: profile.photos.length > 0,
      finalScore: ratingProfile?.finalScore ?? null,
      lastActiveAt: profile.updatedAt,
    };

    // 7. Compute matches for each candidate
    const allMatches: Array<{
      userId: string;
      matchType: ReturnType<typeof getMatchType>;
      relevanceScore: number;
      candidate: (typeof candidates)[number];
    }> = [];

    for (const c of candidates) {
      if (!c.profile || !c.preference) continue;

      // Skip candidates whose photos are still pending scoring
      if (
        c.profile.photos.length > 0 &&
        c.ratingProfile &&
        (c.ratingProfile.ratingStatus === 'PENDING' ||
          c.ratingProfile.ratingStatus === 'SCORING' ||
          c.ratingProfile.ratingStatus === 'REVIEW')
      ) {
        continue;
      }

      // Skip candidates who completed scoring but haven't set match preference
      if (
        c.profile.photos.length > 0 &&
        c.ratingProfile &&
        c.ratingProfile.ratingStatus === 'COMPLETED' &&
        !c.profile.photoMatchPref
      ) {
        continue;
      }

      const candidateUser: MatchCandidate = {
        userId: c.id,
        profile: {
          birthDate: c.profile.birthDate,
          heightCm: c.profile.heightCm,
          weightKg: c.profile.weightKg,
          provinceCode: c.profile.provinceCode,
          cityCode: c.profile.cityCode,
          attribute: c.profile.attribute,
          status: c.profile.status,
          photoMatchPref: c.profile.photoMatchPref,
          highScoreOnly: c.profile.highScoreOnly,
        },
        preference: {
          ageMin: c.preference.ageMin,
          ageMax: c.preference.ageMax,
          heightMinCm: c.preference.heightMinCm,
          heightMaxCm: c.preference.heightMaxCm,
          weightMinKg: c.preference.weightMinKg,
          weightMaxKg: c.preference.weightMaxKg,
          expectedAttributes: c.preference.expectedAttributes as string[],
        },
        hasPhotos: c.profile.photos.length > 0,
        finalScore: c.ratingProfile?.finalScore ?? null,
        lastActiveAt: c.profile.updatedAt,
      };

      const matchType = getMatchType(currentUser, candidateUser);
      if (matchType === 'none') continue;

      const relevanceScore = computeRelevanceScore(currentUser, candidateUser);

      allMatches.push({
        userId: c.id,
        matchType,
        relevanceScore,
        candidate: c,
      });
    }

    // 8. Populate MatchSnapshot cache (best-effort, don't break on failure)
    try {
      await db.matchSnapshot.deleteMany({ where: { userId: session.id } });

      for (const match of allMatches) {
        await db.matchSnapshot.create({
          data: {
            userId: session.id,
            targetUserId: match.userId,
            matchType:
              match.matchType === 'mutual' ? 'mutual' : 'one_way',
            direction:
              match.matchType === 'mutual'
                ? 'mutual'
                : match.matchType === 'one_way_ab'
                  ? 'i_like_target'
                  : 'target_likes_me',
            score: match.relevanceScore,
          },
        });
      }
    } catch (cacheError) {
      console.error('[matches] Failed to update MatchSnapshot cache:', cacheError);
    }

    // 9. Parse query params
    const url = new URL(req.url);
    const type = url.searchParams.get('type') || 'mutual';
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(url.searchParams.get('pageSize') || '20', 10))
    );

    // 10. Filter by type
    let filtered;
    if (type === 'one_way') {
      filtered = allMatches.filter(
        (m) => m.matchType === 'one_way_ab' || m.matchType === 'one_way_ba'
      );
    } else {
      // Default: mutual
      filtered = allMatches.filter((m) => m.matchType === 'mutual');
    }

    // 11. Sort by relevanceScore descending
    filtered.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // 12. Paginate
    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const pageItems = filtered.slice(start, start + pageSize);

    // 13. Format response based on match type
    if (type === 'one_way') {
      // Desensitized one-way response — show match indicators, not actual values
      const data = pageItems.map((m) => {
        const p = m.candidate.profile!;
        const cAge = ageFromDate(p.birthDate);
        const direction =
          m.matchType === 'one_way_ab' ? 'i_like' : 'likes_me';

        // Check if candidate meets the CURRENT USER's preferences
        const ageMatch =
          cAge >= preference.ageMin && cAge <= preference.ageMax;
        const heightMatch =
          p.heightCm >= preference.heightMinCm &&
          p.heightCm <= preference.heightMaxCm;
        const weightMatch =
          p.weightKg >= preference.weightMinKg &&
          p.weightKg <= preference.weightMaxKg;
        const attributeMatch = (preference.expectedAttributes as string[]).includes(
          p.attribute
        );


        return {
          userId: m.userId,
          ageMatch,
          heightMatch,
          weightMatch,
          attributeMatch,
          hasPhotos: p.photos.length > 0,
          provinceCode: p.provinceCode,
          direction,
          relevanceScore: m.relevanceScore,
        };
      });

      return NextResponse.json({
        data,
        currentUserProvinceCode: profile.provinceCode,
        currentUserHasPhotos: profile.photos.length > 0,
        pagination: {
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize),
        },
      });
    }

    // Mutual match — full profile except qqNumber and photos
    const currentUserHasPhotos = profile.photos.length > 0;
    const data = pageItems.map((m) => {
      const c = m.candidate;
      const p = c.profile!;
      const age = ageFromDate(p.birthDate);

      return {
        userId: m.userId,
        nickname: c.authIdentities[0]?.nickname ?? null,
        age,
        heightCm: p.heightCm,
        weightKg: p.weightKg,
        provinceCode: p.provinceCode,
        cityCode: p.cityCode,
        locationType: p.locationType,

        attribute: p.attribute,
        customAttribute: p.customAttribute,
        mbti: p.mbti,
        selfIntro: p.selfIntro,
        hasPhotos: p.photos.length > 0,
        // No-photo users cannot see appearance scores
        finalScore: currentUserHasPhotos ? (c.ratingProfile?.finalScore ?? null) : null,
        relevanceScore: m.relevanceScore,
        // Tell frontend whether the current user has photos (for UI gating)
        currentUserHasPhotos,
      };
    });

    return NextResponse.json({
      data,
      currentUserProvinceCode: profile.provinceCode,
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (err) {
    console.error('[matches] GET error:', err);
    if (err && typeof err === 'object' && 'status' in err) {
      const appErr = err as { code: string; message: string; status: number };
      return error(appErr.code, appErr.message, appErr.status);
    }
    return error('INTERNAL_ERROR', '服务器内部错误', 500);
  }
}
