import { requireAuth } from '@/lib/auth';
import { db } from '@/lib/db';
import { success, error } from '@/lib/api-response';
import { NextResponse } from 'next/server';
import {
  getMatchType,
  computeRelevanceScore,
  type MatchCandidate,
} from '@/lib/matching';
import { commitExpiredActions } from '@/lib/scoring-revocation';
import { ATTRIBUTE_LABELS } from '@/data/attributes';

// ── Helpers ─────────────────────────────────────────────

function ageFromDate(bd: Date): number {
  const today = new Date();
  let age = today.getFullYear() - bd.getFullYear();
  const m = today.getMonth() - bd.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) age--;
  return age;
}

type ExpectationCheckKey = 'age' | 'height' | 'weight' | 'attribute';

interface ExpectationCheck {
  key: ExpectationCheckKey;
  label: string;
  matched: boolean;
  expected: string;
}

function formatAttribute(attribute: string): string {
  return (
    ATTRIBUTE_LABELS[attribute as keyof typeof ATTRIBUTE_LABELS] ?? attribute
  );
}

function formatAttributeList(attributes: string[]): string {
  if (attributes.length === 0) return '未设置';
  return attributes.map(formatAttribute).join(' / ');
}

function buildExpectationChecks(
  preferenceOwner: MatchCandidate,
  subject: MatchCandidate
): ExpectationCheck[] {
  const subjectAge = ageFromDate(subject.profile.birthDate);
  const expectedAttributes = preferenceOwner.preference.expectedAttributes;

  return [
    {
      key: 'age',
      label: '年龄',
      matched:
        subjectAge >= preferenceOwner.preference.ageMin &&
        subjectAge <= preferenceOwner.preference.ageMax,
      expected: `${preferenceOwner.preference.ageMin}-${preferenceOwner.preference.ageMax} 岁`,
    },
    {
      key: 'height',
      label: '身高',
      matched:
        subject.profile.heightCm >= preferenceOwner.preference.heightMinCm &&
        subject.profile.heightCm <= preferenceOwner.preference.heightMaxCm,
      expected: `${preferenceOwner.preference.heightMinCm}-${preferenceOwner.preference.heightMaxCm} cm`,
    },
    {
      key: 'weight',
      label: '体重',
      matched:
        subject.profile.weightKg >= preferenceOwner.preference.weightMinKg &&
        subject.profile.weightKg <= preferenceOwner.preference.weightMaxKg,
      expected: `${preferenceOwner.preference.weightMinKg}-${preferenceOwner.preference.weightMaxKg} kg`,
    },
    {
      key: 'attribute',
      label: '属性',
      matched: expectedAttributes.includes(subject.profile.attribute),
      expected: formatAttributeList(expectedAttributes),
    },
  ];
}

// ── GET /api/matches ────────────────────────────────────

export async function GET(req: Request) {
  try {
    await commitExpiredActions();
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
      hasPhotos: profile.photos.length > 0 && ratingProfile !== null,
      finalScore: ratingProfile?.finalScore ?? null,
      lastActiveAt: profile.updatedAt,
    };

    // 7. Compute matches for each candidate
    const allMatches: Array<{
      userId: string;
      matchType: ReturnType<typeof getMatchType>;
      relevanceScore: number;
      candidate: (typeof candidates)[number];
      candidateUser: MatchCandidate;
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
        hasPhotos: c.profile.photos.length > 0 && c.ratingProfile !== null,
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
        candidateUser,
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
                : match.matchType === 'one_way_ba'
                  ? 'me_fits_them'
                  : 'they_fit_me',
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
      // Desensitized one-way response: show rule outcomes and expected ranges,
      // but do not expose the other user's exact profile values.
      const data = pageItems.map((m) => {
        const p = m.candidate.profile!;
        const targetAgainstMyExpectations = buildExpectationChecks(
          currentUser,
          m.candidateUser
        );
        const meAgainstTargetExpectations = buildExpectationChecks(
          m.candidateUser,
          currentUser
        );
        const targetMatchByKey = Object.fromEntries(
          targetAgainstMyExpectations.map((check) => [
            check.key,
            check.matched,
          ])
        ) as Record<ExpectationCheckKey, boolean>;
        const direction =
          m.matchType === 'one_way_ba' ? 'me_fits_them' : 'they_fit_me';

        return {
          userId: m.userId,
          ageMatch: targetMatchByKey.age,
          heightMatch: targetMatchByKey.height,
          weightMatch: targetMatchByKey.weight,
          attributeMatch: targetMatchByKey.attribute,
          hasPhotos: p.photos.length > 0 && m.candidate.ratingProfile !== null,
          provinceCode: p.provinceCode,
          direction,
          directionLabel:
            direction === 'me_fits_them' ? '我符合他' : '他符合我',
          targetAgainstMyExpectations,
          meAgainstTargetExpectations,
          relevanceScore: m.relevanceScore,
        };
      });

      return NextResponse.json({
        data,
        currentUserProvinceCode: profile.provinceCode,
        currentUserHasPhotos: profile.photos.length > 0 && ratingProfile !== null,
        pagination: {
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize),
        },
      });
    }

    // Mutual match — profile summary only; identity is unlocked after an approved view request.
    const currentUserHasPhotos = profile.photos.length > 0 && ratingProfile !== null;
    const pageTargetIds = pageItems.map((m) => m.userId);
    const approvedViewRequests =
      pageTargetIds.length > 0
        ? await db.viewRequest.findMany({
            where: {
              status: 'APPROVED',
              OR: [
                {
                  requesterId: session.id,
                  targetUserId: { in: pageTargetIds },
                },
                {
                  requesterId: { in: pageTargetIds },
                  targetUserId: session.id,
                },
              ],
            },
            select: { requesterId: true, targetUserId: true },
          })
        : [];
    const identityUnlockedIds = new Set(
      approvedViewRequests.map((request) =>
        request.requesterId === session.id ? request.targetUserId : request.requesterId
      )
    );

    const data = pageItems.map((m) => {
      const c = m.candidate;
      const p = c.profile!;
      const age = ageFromDate(p.birthDate);
      const identityUnlocked = identityUnlockedIds.has(m.userId);

      return {
        userId: m.userId,
        nickname: identityUnlocked ? (c.authIdentities[0]?.nickname ?? null) : null,
        identityUnlocked,
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
        hasPhotos: p.photos.length > 0 && c.ratingProfile !== null,
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
