export const SCOREABLE_TASK_STATUSES = ["PENDING", "SCORING", "NEEDS_RESCORE"] as const;
export const LIVE_ROSTER_TASK_STATUSES = ["PENDING", "SCORING"] as const;
export const ACTIVE_SCORING_TASK_STATUSES = [
  "PENDING",
  "SCORING",
  "NEEDS_RESCORE",
  "REPORTED",
] as const;

const CHINA_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export type ScoringTimelinePhase =
  | "WAITING_PENDING"
  | "PENDING"
  | "PUBLISHING"
  | "PUBLISH_CLOSED"
  | "SCORING_CLOSED"
  | "REVIEW_OVERDUE";

export interface ScoringTaskTimeline {
  pendingAt: Date;
  publishAt: Date;
  publishEndsAt: Date;
  scoringDeadlineAt: Date;
  reviewDeadlineAt: Date;
  phase: ScoringTimelinePhase;
  isReleasedForScoring: boolean;
  isPublishingOpen: boolean;
  isScoringClosed: boolean;
  isReviewOverdue: boolean;
}

export interface SerializedScoringTaskTimeline {
  pendingAt: string;
  publishAt: string;
  publishEndsAt: string;
  scoringDeadlineAt: string;
  reviewDeadlineAt: string;
  phase: ScoringTimelinePhase;
  isReleasedForScoring: boolean;
  isPublishingOpen: boolean;
  isScoringClosed: boolean;
  isReviewOverdue: boolean;
}

export function getChinaDayStart(date: Date): Date {
  const chinaTime = date.getTime() + CHINA_UTC_OFFSET_MS;
  const chinaDayStart = Math.floor(chinaTime / DAY_MS) * DAY_MS;
  return new Date(chinaDayStart - CHINA_UTC_OFFSET_MS);
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * HOUR_MS);
}

function getChinaDayHourBoundary(date: Date, hour: number): Date {
  const dayStart = getChinaDayStart(date);
  return addHours(dayStart, hour);
}

export function getScoringTaskTimeline(
  createdAt: Date,
  now = new Date()
): ScoringTaskTimeline {
  // A scoring batch runs from 18:00 on the previous China calendar day through
  // 17:59:59 today. Uploads before 18:00 join today's already-published batch;
  // uploads from 18:00 onward wait for tomorrow's on-duty scorers.
  const currentDayPendingAt = getChinaDayHourBoundary(createdAt, 18);
  const pendingAt =
    createdAt.getTime() < currentDayPendingAt.getTime()
      ? addHours(currentDayPendingAt, -24)
      : currentDayPendingAt;
  const publishAt = addHours(pendingAt, 6);
  const publishEndsAt = addHours(publishAt, 18);
  const scoringDeadlineAt = addHours(publishAt, 24);
  const reviewDeadlineAt = addHours(scoringDeadlineAt, 18);
  const nowTime = now.getTime();

  let phase: ScoringTimelinePhase = "WAITING_PENDING";
  if (nowTime >= reviewDeadlineAt.getTime()) {
    phase = "REVIEW_OVERDUE";
  } else if (nowTime >= scoringDeadlineAt.getTime()) {
    phase = "SCORING_CLOSED";
  } else if (nowTime >= publishEndsAt.getTime()) {
    phase = "PUBLISH_CLOSED";
  } else if (nowTime >= publishAt.getTime()) {
    phase = "PUBLISHING";
  } else if (nowTime >= pendingAt.getTime()) {
    phase = "PENDING";
  }

  return {
    pendingAt,
    publishAt,
    publishEndsAt,
    scoringDeadlineAt,
    reviewDeadlineAt,
    phase,
    isReleasedForScoring:
      nowTime >= publishAt.getTime() && nowTime < scoringDeadlineAt.getTime(),
    isPublishingOpen: nowTime >= publishAt.getTime() && nowTime < publishEndsAt.getTime(),
    isScoringClosed: nowTime >= scoringDeadlineAt.getTime(),
    isReviewOverdue: nowTime >= reviewDeadlineAt.getTime(),
  };
}

export function serializeScoringTaskTimeline(
  timeline: ScoringTaskTimeline
): SerializedScoringTaskTimeline {
  return {
    pendingAt: timeline.pendingAt.toISOString(),
    publishAt: timeline.publishAt.toISOString(),
    publishEndsAt: timeline.publishEndsAt.toISOString(),
    scoringDeadlineAt: timeline.scoringDeadlineAt.toISOString(),
    reviewDeadlineAt: timeline.reviewDeadlineAt.toISOString(),
    phase: timeline.phase,
    isReleasedForScoring: timeline.isReleasedForScoring,
    isPublishingOpen: timeline.isPublishingOpen,
    isScoringClosed: timeline.isScoringClosed,
    isReviewOverdue: timeline.isReviewOverdue,
  };
}

export function formatChinaDateTime(date: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function parseScorerSnapshot(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(value.map((item) => String(item)).filter((item) => item.length > 0))
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
    const report = item as {
      reporterId?: unknown;
      reason?: unknown;
      createdAt?: unknown;
    };
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
  const source = LIVE_ROSTER_TASK_STATUSES.includes(
    status as (typeof LIVE_ROSTER_TASK_STATUSES)[number]
  )
    ? onDutyScorerIds
    : snapshot;

  return Array.from(new Set(source)).filter((id) => id !== ratedUserId);
}
