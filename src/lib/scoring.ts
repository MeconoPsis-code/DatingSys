export const SCOREABLE_TASK_STATUSES = ["PENDING", "SCORING", "NEEDS_RESCORE"] as const;
export const LIVE_ROSTER_TASK_STATUSES = ["PENDING", "SCORING"] as const;
export const ACTIVE_SCORING_TASK_STATUSES = [
  "PENDING",
  "SCORING",
  "NEEDS_RESCORE",
  "REPORTED",
] as const;

export function parseScorerSnapshot(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((item) => String(item))
        .filter((item) => item.length > 0)
    )
  );
}

export function parsePhotoReports(value: unknown): Array<{
  reporterId: string;
  reason?: string;
  createdAt?: string;
}> {
  if (!Array.isArray(value)) return [];

  const reports: Array<{ reporterId: string; reason?: string; createdAt?: string }> = [];

  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const report = item as { reporterId?: unknown; reason?: unknown; createdAt?: unknown };
    if (!report.reporterId) continue;

    reports.push({
      reporterId: String(report.reporterId),
      reason: typeof report.reason === "string" ? report.reason : undefined,
      createdAt: typeof report.createdAt === "string" ? report.createdAt : undefined,
    });
  }

  return reports;
}

export function roundScore(score: number): number {
  return Math.round(score * 10) / 10;
}

export function calculateAverageScore(scores: Array<{ score: number }>): number | null {
  if (scores.length === 0) return null;
  const avg = scores.reduce((sum, item) => sum + item.score, 0) / scores.length;
  return roundScore(avg);
}

export function getAssignedScorerIdsForTask({
  status,
  ratedUserId,
  scorerSnapshot,
  onDutyScorerIds,
}: {
  status: string;
  ratedUserId: string;
  scorerSnapshot: unknown;
  onDutyScorerIds: string[];
}): string[] {
  const snapshot = parseScorerSnapshot(scorerSnapshot);
  const source = LIVE_ROSTER_TASK_STATUSES.includes(status as (typeof LIVE_ROSTER_TASK_STATUSES)[number])
    ? onDutyScorerIds
    : snapshot;

  return Array.from(new Set(source)).filter((id) => id !== ratedUserId);
}
