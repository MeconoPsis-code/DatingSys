import { requireAuth } from '@/lib/auth';
import { db } from '@/lib/db';
import { success, error } from '@/lib/api-response';
import { getSignedUrl } from '@/lib/storage';

// ── Helpers ─────────────────────────────────────────────

function ageFromDate(bd: Date): number {
  const today = new Date();
  let age = today.getFullYear() - bd.getFullYear();
  const m = today.getMonth() - bd.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) age--;
  return age;
}

// ── GET /api/matches/:userId ────────────────────────────

export async function GET(
  req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const session = await requireAuth();
    const { userId } = await params;

    // 1. Check permission: mutual match OR approved view request
    const matchSnapshot = await db.matchSnapshot.findUnique({
      where: {
        userId_targetUserId: {
          userId: session.id,
          targetUserId: userId,
        },
      },
    });
    const isMutual = matchSnapshot?.matchType === 'mutual';

    // Photo approval is bidirectional: if either party approved, both can see photos
    const approvedRequest = await db.viewRequest.findFirst({
      where: {
        status: 'APPROVED',
        OR: [
          { requesterId: session.id, targetUserId: userId },
          { requesterId: userId, targetUserId: session.id },
        ],
      },
    });

    if (!isMutual && !approvedRequest) {
      return error('FORBIDDEN', '无权查看该用户资料', 403);
    }

    // 2. Load target user's full profile
    const targetUser = await db.user.findUnique({
      where: { id: userId },
      include: {
        profile: { include: { photos: true } },
        preference: true,
        ratingProfile: true,
        authIdentities: { select: { nickname: true }, take: 1 },
      },
    });

    if (!targetUser || !targetUser.profile) {
      return error('NOT_FOUND', '用户不存在或未完善资料', 404);
    }

    // 3. Check if current user has photos
    const currentUserPhotoCount = await db.profilePhoto.count({
      where: { profile: { userId: session.id } },
    });
    const currentUserHasPhotos = currentUserPhotoCount > 0;

    // 4. Photos require an approved ViewRequest AND the requesting user must also have photos
    const photoApproved = !!approvedRequest;
    let photos: { id: string; url: string; order: number }[] = [];
    if (photoApproved && currentUserHasPhotos) {
      photos = await Promise.all(
        (targetUser.profile.photos ?? []).map(async (p) => ({
          id: p.id,
          url: await getSignedUrl(p.storageKey),
          order: p.order,
        }))
      );
    }

    // 5. Build response — no-photo users cannot see appearance score
    const p = targetUser.profile;
    const age = ageFromDate(p.birthDate);

    return success({
      userId: targetUser.id,
      qqNumber: approvedRequest ? targetUser.qqNumber : null,
      nickname: targetUser.authIdentities[0]?.nickname ?? null,
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
      hasPhotos: (targetUser.profile.photos ?? []).length > 0,
      photoApproved: photoApproved && currentUserHasPhotos,
      finalScore: currentUserHasPhotos ? (targetUser.ratingProfile?.finalScore ?? null) : null,
      photos,
    });
  } catch (err) {
    console.error('[matches/:userId] GET error:', err);
    if (err && typeof err === 'object' && 'status' in err) {
      const appErr = err as { code: string; message: string; status: number };
      return error(appErr.code, appErr.message, appErr.status);
    }
    return error('INTERNAL_ERROR', '服务器内部错误', 500);
  }
}
