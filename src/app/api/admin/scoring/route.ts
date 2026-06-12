import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { error, paginated } from '@/lib/api-response';
import { getSignedUrl } from '@/lib/storage';

// ── GET /api/admin/scoring — admin scoring management ──

export async function GET(req: Request) {
  try {
    await requireRole('ADMIN');

    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
    const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get('pageSize') || '20')));
    const status = url.searchParams.get('status') || undefined;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;

    const [total, tasks] = await Promise.all([
      db.ratingTask.count({ where }),
      db.ratingTask.findMany({
        where,
        include: {
          ratedUser: {
            include: {
              authIdentities: { select: { nickname: true }, take: 1 },
              ratingProfile: { select: { finalScore: true } },
              profile: {
                include: {
                  photos: { orderBy: { order: 'asc' } },
                },
              },
            },
          },
          scores: {
            include: {
              scorer: {
                include: {
                  authIdentities: { select: { nickname: true }, take: 1 },
                },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    // Fetch ALL current eligible scorers so the admin sees the complete list
    const allEligibleScorers = await db.user.findMany({
      where: {
        role: { in: ['SCORER', 'ADMIN'] },
        status: 'ACTIVE',
      },
      include: { authIdentities: { select: { nickname: true }, take: 1 } },
    });

    const scorerNameMap: Record<string, { nickname: string | null; qq: string | null }> = {};
    for (const u of allEligibleScorers) {
      scorerNameMap[u.id] = {
        nickname: u.authIdentities[0]?.nickname ?? null,
        qq: u.qqNumber,
      };
    }

    const data = await Promise.all(
      tasks.map(async (t) => {
        const photos = t.ratedUser.profile?.photos ?? [];

        // Use all eligible scorers minus the rated user as the full scorer list
        const fullScorerList = allEligibleScorers
          .filter((s) => s.id !== t.ratedUserId)
          .map((s) => s.id);

        const photosWithUrls = await Promise.all(
          photos.map(async (p) => ({
            id: p.id,
            order: p.order,
            url: await getSignedUrl(p.storageKey, 3600),
          }))
        );

        return {
          id: t.id,
          ratedUserId: t.ratedUserId,
          ratedUserNickname: t.ratedUser.authIdentities[0]?.nickname ?? null,
          ratedUserQQ: t.ratedUser.qqNumber,
          photoObjectKey: t.photoObjectKey,
          status: t.status,
          scorerSnapshot: fullScorerList,
          scorerNames: scorerNameMap,
          scores: t.scores.map((s) => ({
            id: s.id,
            scorerUserId: s.scorerUserId,
            scorerNickname: s.scorer.authIdentities[0]?.nickname ?? null,
            scorerQQ: s.scorer.qqNumber,
            score: s.score,
            createdAt: s.createdAt,
          })),
          scoredCount: t.scores.length,
          totalScorers: fullScorerList.length,
          photos: photosWithUrls,
          completedAt: t.completedAt,
          createdAt: t.createdAt,
          finalScore: t.ratedUser.ratingProfile?.finalScore ?? null,
        };
      })
    );

    return paginated(data, total, page, pageSize);
  } catch (err) {
    console.error('[admin/scoring] GET error:', err);
    if (err && typeof err === 'object' && 'status' in err) {
      const appErr = err as { code: string; message: string; status: number };
      return error(appErr.code, appErr.message, appErr.status);
    }
    return error('INTERNAL_ERROR', '服务器内部错误', 500);
  }
}
