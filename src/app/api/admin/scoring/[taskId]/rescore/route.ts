import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { success, error } from '@/lib/api-response';
import { getOnDutyScorers } from '@/lib/scorer-duty';
import { getAssignedScorerIdsForTask, parsePhotoReports, parseScorerSnapshot } from '@/lib/scoring';

// ── POST /api/admin/scoring/[taskId]/rescore — super admin rescore ──

export async function POST(
  req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const session = await requireRole('SUPER_ADMIN');
    const { taskId } = await params;
    const body = await req.json().catch(() => ({}));
    const mode = typeof body?.mode === 'string' ? body.mode : 'full';

    // Find the task
    const task = await db.ratingTask.findUnique({
      where: { id: taskId },
      include: { scores: { select: { scorerUserId: true } } },
    });
    if (!task) {
      return error('NOT_FOUND', '评分任务不存在', 404);
    }

    if (mode === 'reporters_and_unscored' || mode === 'reported_only') {
      const reports = parsePhotoReports(task.photoReports);
      if (reports.length === 0) {
        return error('NO_PHOTO_REPORTS', '该任务没有待处理的照片举报', 400);
      }

      const onDutyScorerIds = (await getOnDutyScorers({ excludeUserId: task.ratedUserId })).map((s) => s.id);
      const snapshotScorerIds = parseScorerSnapshot(task.scorerSnapshot);
      const previouslyAssignedScorerIds = task.status === 'REPORTED'
        ? Array.from(new Set([...snapshotScorerIds, ...onDutyScorerIds])).filter(
            (id) => id !== task.ratedUserId
          )
        : getAssignedScorerIdsForTask({
            status: task.status,
            ratedUserId: task.ratedUserId,
            scorerSnapshot: task.scorerSnapshot,
            onDutyScorerIds,
          });
      const scoredScorerIds = new Set(task.scores.map((score) => score.scorerUserId));
      const reporterIds = reports.map((report) => report.reporterId);
      const unscoredScorerIds = previouslyAssignedScorerIds.filter((id) => !scoredScorerIds.has(id));
      const candidateScorerIds = Array.from(
        new Set([...reporterIds, ...unscoredScorerIds])
      ).filter((id) => id !== task.ratedUserId);

      const eligibleScorers = candidateScorerIds.length
        ? await db.user.findMany({
            where: {
              id: { in: candidateScorerIds },
              status: 'ACTIVE',
              role: { in: ['SCORER', 'ADMIN'] },
            },
            select: { id: true },
          })
        : [];
      const targetScorerIds = candidateScorerIds.filter((id) =>
        eligibleScorers.some((scorer) => scorer.id === id)
      );

      if (targetScorerIds.length === 0) {
        return error('NO_TARGET_SCORERS', '没有可重新分配的评分员', 400);
      }

      await db.$transaction([
        db.ratingScore.deleteMany({
          where: {
            ratingTaskId: taskId,
            scorerUserId: { in: targetScorerIds },
          },
        }),
        db.ratingTask.update({
          where: { id: taskId },
          data: {
            status: 'NEEDS_RESCORE',
            completedAt: null,
            scorerSnapshot: targetScorerIds,
            photoReports: [],
            pendingActionType: null,
            pendingActionValue: null,
            pendingActionExpiresAt: null,
            pendingActionActorId: null,
          },
        }),
        db.ratingProfile.updateMany({
          where: { userId: task.ratedUserId },
          data: {
            ratingStatus: 'SCORING',
            finalScore: null,
            scoreCompletedAt: null,
            rankingOptIn: false,
            rankingOptInUpdatedAt: null,
          },
        }),
      ]);

      await db.auditLog.create({
        data: {
          actorUserId: session.id,
          action: 'ADMIN_REPORT_NO_REVOKE_RESCORE',
          targetType: 'RatingTask',
          targetId: taskId,
          metadata: {
            ratedUserId: task.ratedUserId,
            reporterIds,
            unscoredScorerIds,
            targetScorerIds,
            retainedScoreCount: task.scores.length - task.scores.filter((score) => targetScorerIds.includes(score.scorerUserId)).length,
          },
        },
      });

      return success({
        message: '已清除举报并仅分配给举报评分员及未评分评分员重新评分',
        scorerCount: targetScorerIds.length,
      });
    }

    // Rebuild from today's on-duty roster, excluding the rated user.
    const scorers = await getOnDutyScorers({ excludeUserId: task.ratedUserId });
    const newScorerSnapshot = scorers.map((s) => s.id);

    // Transaction: delete scores, reset task, reset rating profile
    await db.$transaction([
      // 1. Delete all existing scores
      db.ratingScore.deleteMany({ where: { ratingTaskId: taskId } }),
      // 2. Reset task to PENDING with refreshed scorer snapshot
      db.ratingTask.update({
        where: { id: taskId },
        data: {
          status: 'PENDING',
          completedAt: null,
          scorerSnapshot: newScorerSnapshot,
          photoReports: [],
          pendingActionType: null,
          pendingActionValue: null,
          pendingActionExpiresAt: null,
          pendingActionActorId: null,
        },
      }),
      // 3. Reset user's rating profile
      db.ratingProfile.updateMany({
        where: { userId: task.ratedUserId },
        data: {
          ratingStatus: 'PENDING',
          finalScore: null,
          scoreCompletedAt: null,
          rankingOptIn: false,
          rankingOptInUpdatedAt: null,
        },
      }),
    ]);

    // Audit log
    await db.auditLog.create({
      data: {
        actorUserId: session.id,
        action: 'ADMIN_RESCORE',
        targetType: 'RatingTask',
        targetId: taskId,
        metadata: {
          ratedUserId: task.ratedUserId,
          newScorerCount: newScorerSnapshot.length,
          clearedPhotoReports: Array.isArray(task.photoReports) ? task.photoReports.length : 0,
        },
      },
    });

    return success({
      message: '已重置评分，所有评分员将重新评分',
      scorerCount: newScorerSnapshot.length,
    });
  } catch (err) {
    console.error('[admin/scoring/rescore] POST error:', err);
    if (err && typeof err === 'object' && 'status' in err) {
      const appErr = err as { code: string; message: string; status: number };
      return error(appErr.code, appErr.message, appErr.status);
    }
    return error('INTERNAL_ERROR', '服务器内部错误', 500);
  }
}
