import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { error, paginated } from '@/lib/api-response';
import { getSignedUrl } from '@/lib/storage';
import { commitExpiredActions } from '@/lib/scoring-revocation';
import { getOnDutyScorers } from '@/lib/scorer-duty';
import { calculateAverageScore, getAssignedScorerIdsForTask, parsePhotoReports } from '@/lib/scoring';

// ── GET /api/admin/scoring — admin scoring management ──

export async function GET(req: Request) {
  try {
    await requireRole('ADMIN');

    // Process any expired revocation windows first
    await commitExpiredActions();

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

    const onDutyScorerIds = (await getOnDutyScorers()).map((scorer) => scorer.id);
    const reportScorerIds = tasks.flatMap((task) => {
      return parsePhotoReports(task.photoReports).map((report) => report.reporterId);
    });
    const knownScorerIds = Array.from(
      new Set(
        [
          ...onDutyScorerIds,
          ...reportScorerIds,
          ...tasks.flatMap((task) => {
            const snapshot = task.scorerSnapshot as unknown;
            return Array.isArray(snapshot) ? snapshot.map(String) : [];
          }),
        ]
      )
    );

    const knownScorers = await db.user.findMany({
      where: { id: { in: knownScorerIds } },
      include: { authIdentities: { select: { nickname: true }, take: 1 } },
    });

    const scorerNameMap: Record<string, { nickname: string | null; qq: string | null }> = {};
    const eligibleScorerIds = new Set<string>();
    for (const u of knownScorers) {
      scorerNameMap[u.id] = {
        nickname: u.authIdentities[0]?.nickname ?? null,
        qq: u.qqNumber,
      };
      if (u.role === 'SCORER' || u.role === 'ADMIN') {
        eligibleScorerIds.add(u.id);
      }
    }

    const data = await Promise.all(
      tasks.map(async (t) => {
        const photos = t.ratedUser.profile?.photos ?? [];

        const assignedScorerIds = getAssignedScorerIdsForTask({
          status: t.status,
          ratedUserId: t.ratedUserId,
          scorerSnapshot: t.scorerSnapshot,
          onDutyScorerIds,
        });
        const liveAssignedScorerList = assignedScorerIds.filter(
          (id) => id !== t.ratedUserId && eligibleScorerIds.has(id)
        );
        const assignedScorerSet = new Set(liveAssignedScorerList);
        const liveScore = calculateAverageScore(t.scores);

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
          scorerSnapshot: liveAssignedScorerList,
          scorerNames: scorerNameMap,
          scores: t.scores.map((s) => ({
            id: s.id,
            scorerUserId: s.scorerUserId,
            scorerNickname: s.scorer.authIdentities[0]?.nickname ?? null,
            scorerQQ: s.scorer.qqNumber,
            score: s.score,
            createdAt: s.createdAt,
          })),
          scoredCount: t.scores.filter((score) => assignedScorerSet.has(score.scorerUserId)).length,
          totalScorers: liveAssignedScorerList.length,
          photos: photosWithUrls,
          completedAt: t.completedAt,
          createdAt: t.createdAt,
          finalScore: t.ratedUser.ratingProfile?.finalScore ?? null,
          liveScore,
          photoReports: parsePhotoReports(t.photoReports),
          pendingActionType: t.pendingActionType,
          pendingActionValue: t.pendingActionValue,
          pendingActionExpiresAt: t.pendingActionExpiresAt ? t.pendingActionExpiresAt.toISOString() : null,
          pendingActionActorId: t.pendingActionActorId,
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
