import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { error, success } from "@/lib/api-response";

const SCORE_BUCKETS = [
  { label: "0.0-0.9", min: 0, max: 1 },
  { label: "1.0-1.9", min: 1, max: 2 },
  { label: "2.0-2.9", min: 2, max: 3 },
  { label: "3.0-3.9", min: 3, max: 4 },
  { label: "4.0-4.9", min: 4, max: 5 },
  { label: "5.0-5.9", min: 5, max: 6 },
  { label: "6.0-6.9", min: 6, max: 7 },
  { label: "7.0-7.9", min: 7, max: 8 },
  { label: "8.0-8.9", min: 8, max: 9 },
  { label: "9.0-10.0", min: 9, max: 10.1 },
] as const;

function round(value: number, digits = 1) {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]) {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[mid];
  }

  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function stdDev(values: number[], avg: number) {
  if (values.length <= 1) return 0;

  const variance =
    values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;

  return Math.sqrt(variance);
}

function mode(values: number[]) {
  if (values.length === 0) {
    return { scores: [] as number[], frequency: 0 };
  }

  const counts = new Map<number, number>();
  for (const value of values) {
    const score = round(value, 1);
    counts.set(score, (counts.get(score) ?? 0) + 1);
  }

  const maxFrequency = Math.max(...counts.values());
  if (maxFrequency <= 1 && values.length > 1) {
    return { scores: [] as number[], frequency: 0 };
  }

  const scores = Array.from(counts.entries())
    .filter(([, count]) => count === maxFrequency)
    .map(([score]) => score)
    .sort((a, b) => a - b);

  return { scores, frequency: maxFrequency };
}

function latestIso(dates: Array<Date | null>) {
  const timestamps = dates
    .filter((date): date is Date => Boolean(date))
    .map((date) => date.getTime());

  if (timestamps.length === 0) return null;

  return new Date(Math.max(...timestamps)).toISOString();
}

export async function GET() {
  try {
    await requireRole("ADMIN");

    const [publishedProfiles, completedTasks] = await Promise.all([
      db.ratingProfile.findMany({
        where: {
          ratingStatus: "COMPLETED",
          finalScore: { not: null },
        },
        select: {
          finalScore: true,
          scoreCompletedAt: true,
        },
      }),
      db.ratingTask.findMany({
        where: { status: "COMPLETED" },
        select: {
          scores: {
            select: {
              scorerUserId: true,
              score: true,
              createdAt: true,
              scorer: {
                select: {
                  qqNumber: true,
                  authIdentities: {
                    select: { nickname: true },
                    take: 1,
                  },
                },
              },
            },
          },
        },
      }),
    ]);

    const publishedScores = publishedProfiles
      .map((profile) => profile.finalScore)
      .filter((score): score is number => typeof score === "number");

    const distribution = SCORE_BUCKETS.map((bucket) => ({
      label: bucket.label,
      min: bucket.min,
      max: bucket.max >= 10 ? 10 : bucket.max - 0.1,
      count: 0,
      percentage: 0,
    }));

    for (const score of publishedScores) {
      const bucketIndex = SCORE_BUCKETS.findIndex(
        (bucket) => score >= bucket.min && score < bucket.max
      );

      if (bucketIndex >= 0) {
        distribution[bucketIndex].count += 1;
      }
    }

    for (const bucket of distribution) {
      bucket.percentage =
        publishedScores.length > 0
          ? round((bucket.count / publishedScores.length) * 100, 1)
          : 0;
    }

    const scorerMap = new Map<
      string,
      {
        scorerUserId: string;
        nickname: string | null;
        qqNumber: string | null;
        scores: number[];
        latestScoredAt: Date | null;
      }
    >();

    for (const task of completedTasks) {
      for (const score of task.scores) {
        const existing = scorerMap.get(score.scorerUserId);

        if (existing) {
          existing.scores.push(score.score);
          if (
            !existing.latestScoredAt ||
            score.createdAt.getTime() > existing.latestScoredAt.getTime()
          ) {
            existing.latestScoredAt = score.createdAt;
          }
          continue;
        }

        scorerMap.set(score.scorerUserId, {
          scorerUserId: score.scorerUserId,
          nickname: score.scorer.authIdentities[0]?.nickname ?? null,
          qqNumber: score.scorer.qqNumber,
          scores: [score.score],
          latestScoredAt: score.createdAt,
        });
      }
    }

    const scorerStats = Array.from(scorerMap.values())
      .map((scorer) => {
        const avg = average(scorer.scores) ?? 0;
        const modeResult = mode(scorer.scores);

        return {
          scorerUserId: scorer.scorerUserId,
          nickname: scorer.nickname,
          qqNumber: scorer.qqNumber,
          scoreCount: scorer.scores.length,
          averageScore: round(avg, 2),
          medianScore: round(median(scorer.scores) ?? 0, 2),
          modeScores: modeResult.scores,
          modeFrequency: modeResult.frequency,
          minScore: Math.min(...scorer.scores),
          maxScore: Math.max(...scorer.scores),
          stdDevScore: round(stdDev(scorer.scores, avg), 2),
          latestScoredAt: scorer.latestScoredAt?.toISOString() ?? null,
        };
      })
      .sort((a, b) => b.scoreCount - a.scoreCount || b.averageScore - a.averageScore);

    const publishedAverage = average(publishedScores);
    const publishedMedian = median(publishedScores);
    const scorerAverages = scorerStats.map((scorer) => scorer.averageScore);

    return success({
      summary: {
        publishedCount: publishedScores.length,
        publishedAverageScore:
          publishedAverage === null ? null : round(publishedAverage, 2),
        publishedMedianScore: publishedMedian === null ? null : round(publishedMedian, 2),
        latestPublishedAt: latestIso(
          publishedProfiles.map((profile) => profile.scoreCompletedAt)
        ),
        scorerCount: scorerStats.length,
        scorerScoreCount: scorerStats.reduce((sum, scorer) => sum + scorer.scoreCount, 0),
        scorerAverageOfAverages:
          scorerAverages.length === 0 ? null : round(average(scorerAverages) ?? 0, 2),
      },
      distribution,
      scorerStats,
    });
  } catch (err) {
    console.error("[admin/scoring/dashboard] GET error:", err);
    if (err && typeof err === "object" && "status" in err) {
      const appErr = err as { code: string; message: string; status: number };
      return error(appErr.code, appErr.message, appErr.status);
    }
    return error("INTERNAL_ERROR", "服务器内部错误", 500);
  }
}
