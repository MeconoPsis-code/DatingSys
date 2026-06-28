import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { success, error } from '@/lib/api-response';
import { getOnDutyScorerIds } from '@/lib/scorer-duty';

/**
 * POST /api/admin/scoring/fix-stuck
 * Super admin: find all non-COMPLETED, non-REVIEW tasks where all eligible
 * scorers have already scored, and promote them to REVIEW.
 */
export async function POST() {
  try {
    await requireRole('SUPER_ADMIN');

    // Find ALL tasks that are not yet in REVIEW or COMPLETED
    const stuckTasks = await db.ratingTask.findMany({
      where: {
        status: { notIn: ['REVIEW', 'COMPLETED'] },
      },
      include: {
        scores: { select: { id: true, scorerUserId: true } },
      },
    });

    let fixedCount = 0;
    const debugInfo: Array<{
      taskId: string;
      status: string;
      snapshotLength: number;
      eligibleCount: number;
      scoredCount: number;
      promoted: boolean;
    }> = [];

    for (const task of stuckTasks) {
      const rawSnapshot = task.scorerSnapshot;
      // Safely parse scorer snapshot — handle both array and other formats
      let scorerIds: string[] = [];
      if (Array.isArray(rawSnapshot)) {
        scorerIds = rawSnapshot.map(String);
      }

      const eligibleScorerIds = await getOnDutyScorerIds({
        excludeUserId: task.ratedUserId,
      });
      const eligibleScorerIdSet = new Set(eligibleScorerIds);
      const eligibleCount = eligibleScorerIds.length;
      const scoredCount = task.scores.filter((score) =>
        eligibleScorerIdSet.has(score.scorerUserId)
      ).length;
      const shouldPromote = eligibleCount > 0 && scoredCount >= eligibleCount;

      debugInfo.push({
        taskId: task.id,
        status: task.status,
        snapshotLength: scorerIds.length,
        eligibleCount,
        scoredCount,
        promoted: shouldPromote,
      });

      if (shouldPromote) {
        await db.ratingTask.update({
          where: { id: task.id },
          data: {
            status: 'REVIEW',
            completedAt: task.completedAt ?? new Date(),
          },
        });

        await db.ratingProfile.upsert({
          where: { userId: task.ratedUserId },
          create: {
            userId: task.ratedUserId,
            ratingStatus: 'REVIEW',
          },
          update: {
            ratingStatus: 'REVIEW',
          },
        });

        fixedCount++;
      }
    }

    return success({
      message: `已修复 ${fixedCount} 个卡住的评分任务（共扫描 ${stuckTasks.length} 个）`,
      fixedCount,
      scanned: stuckTasks.length,
      debug: debugInfo,
    });
  } catch (err) {
    console.error('[admin/scoring/fix-stuck] POST error:', err);
    if (err && typeof err === 'object' && 'status' in err) {
      const appErr = err as { code: string; message: string; status: number };
      return error(appErr.code, appErr.message, appErr.status);
    }
    return error('INTERNAL_ERROR', '服务器内部错误', 500);
  }
}
