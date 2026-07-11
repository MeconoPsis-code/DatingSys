"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Image from "next/image";
import { ArrowDownToLine } from "lucide-react";
import { PhotoLightbox } from "@/components/profile/photo-lightbox";

/* ─── Types ──────────────────────────────────────────── */

interface ScoreEntry {
  id: string;
  scorerUserId: string;
  scorerNickname: string | null;
  scorerQQ: string | null;
  score: number;
  createdAt: string;
}

interface TaskPhoto {
  id: string;
  order: number;
  url: string;
  thumbUrl?: string;
}

interface PhotoReport {
  reporterId: string;
  reason: string;
  createdAt: string;
}

interface ScoringTimeline {
  pendingAt: string;
  publishAt: string;
  publishEndsAt: string;
  scoringDeadlineAt: string;
  reviewDeadlineAt: string;
  phase: string;
  isReleasedForScoring: boolean;
  isPublishingOpen: boolean;
  isScoringClosed: boolean;
  isReviewOverdue: boolean;
}

interface ScoringTask {
  id: string;
  ratedUserId: string;
  ratedUserNickname: string | null;
  ratedUserQQ: string | null;
  photoObjectKey: string;
  status: string;
  scorerSnapshot: string[];
  scorerNames: Record<string, { nickname: string | null; qq: string | null }>;
  scores: ScoreEntry[];
  scoredCount: number;
  totalScorers: number;
  photos: TaskPhoto[];
  completedAt: string | null;
  createdAt: string;
  timeline: ScoringTimeline;
  finalScore: number | null;
  liveScore: number | null;
  photoReports: PhotoReport[];
  pendingActionType: string | null;
  pendingActionValue: number | null;
  pendingActionExpiresAt: string | null;
  pendingActionActorId: string | null;
}

/* ─── Constants ──────────────────────────────────────── */

const STATUS_TABS = [
  { value: "", label: "全部" },
  { value: "REVIEW", label: "待审核", superOnly: true },
  { value: "REPORTED", label: "被举报" },
  { value: "NEEDS_RESCORE", label: "需重评" },
  { value: "PENDING", label: "待定" },
  { value: "SCORING", label: "评分中" },
  { value: "COMPLETED", label: "已完成" },
] as const;

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "待定", cls: "bg-[#fffbe6] text-[#d48806] border-[#ffe58f]" },
  SCORING: { label: "评分中", cls: "bg-[#e6f4ff] text-[#0958d9] border-[#91caff]" },
  REVIEW: { label: "待审核", cls: "bg-[#fffbe6] text-[#d48806] border-[#ffe58f]" },
  COMPLETED: { label: "已完成", cls: "bg-[#f6ffed] text-[#389e0d] border-[#b7eb8f]" },
  REPORTED: { label: "被举报", cls: "bg-[#fff1f0] text-[#cf1322] border-[#ffa39e]" },
  NEEDS_RESCORE: { label: "需重评", cls: "bg-[#fff7e6] text-[#d46b08] border-[#ffd591]" },
};
const FORCE_PUBLISHABLE_STATUSES = ["PENDING", "SCORING", "NEEDS_RESCORE"] as const;

function canForcePublishStatus(status: string) {
  return FORCE_PUBLISHABLE_STATUSES.includes(
    status as (typeof FORCE_PUBLISHABLE_STATUSES)[number]
  );
}

function formatDate(d: string) {
  return new Date(d).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function scoreColor(score: number) {
  if (score >= 7) return "text-emerald-400";
  if (score >= 5) return "text-amber-400";
  return "text-red-400";
}

function truncateId(id: string) {
  return id.length > 10 ? id.slice(0, 8) + "…" : id;
}

/* ─── Override Score Input ───────────────────────────── */

function OverrideScoreInput({ onSubmit }: { onSubmit: (score: number) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("6.0");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center rounded-lg border border-brand-blue/30 bg-blue-1 px-3 py-1.5 text-xs font-medium text-brand-blue transition-all hover:bg-brand-blue/20"
      >
        <svg
          viewBox="0 0 24 24"
          className="mr-1 h-3.5 w-3.5 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round"
        >
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
        直接设定分数
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        min="0"
        max="10"
        step="0.1"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-16 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2 py-1 text-xs text-[hsl(var(--foreground))] focus:border-[hsl(var(--primary))] focus:outline-none"
      />
      <button
        type="button"
        onClick={() => {
          const n = parseFloat(value);
          if (isNaN(n) || n < 0 || n > 10 || n * 10 !== Math.round(n * 10)) {
            alert("评分必须在 0-10 之间，步长 0.1");
            return;
          }
          onSubmit(n);
          setOpen(false);
        }}
        className="rounded-md bg-brand-blue/15 px-2 py-1 text-xs font-medium text-brand-blue transition-all hover:bg-brand-blue/30"
      >
        确认
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="rounded-md px-2 py-1 text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
      >
        取消
      </button>
    </div>
  );
}

/* ─── Task Card ──────────────────────────────────────── */

function TaskCard({
  task,
  isSuperAdmin,
  onRescore,
  onApprove,
  onOverride,
  onRevokePhotos,
  onRevoke,
}: {
  task: ScoringTask;
  isSuperAdmin: boolean;
  onRescore: (taskId: string, mode?: "reporters_and_unscored") => void;
  onApprove: (taskId: string) => void;
  onOverride: (taskId: string, score: number) => void;
  onRevokePhotos: (taskId: string) => void;
  onRevoke: (taskId: string) => void;
}) {
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!task.pendingActionExpiresAt) {
      return;
    }

    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [task.pendingActionExpiresAt]);

  const timeLeft = useMemo(() => {
    if (!task.pendingActionExpiresAt) return "";

    const targetTime = new Date(task.pendingActionExpiresAt).getTime();
    const diff = targetTime - now;

    if (diff <= 0) return "00:00";

    const totalSec = Math.floor(diff / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    const mm = String(m).padStart(2, "0");
    const ss = String(s).padStart(2, "0");
    return `${mm}:${ss}`;
  }, [task.pendingActionExpiresAt, now]);
  const badge = STATUS_BADGE[task.status] || { label: task.status, cls: "" };
  const progress = task.totalScorers > 0 ? task.scoredCount / task.totalScorers : 0;
  const progressPct = Math.round(progress * 100);
  const timelineItems = [
    { label: "待定", value: task.timeline.pendingAt },
    { label: "发布", value: task.timeline.publishAt },
    { label: "停发", value: task.timeline.publishEndsAt },
    { label: "评分截止", value: task.timeline.scoringDeadlineAt },
    { label: "审核截止", value: task.timeline.reviewDeadlineAt },
  ];

  // Map scored user IDs
  const scoredUserIds = new Set(task.scores.map((s) => s.scorerUserId));

  const calculatedAvg =
    task.liveScore ??
    (task.scores.length > 0
      ? Math.round(
          (task.scores.reduce((sum, s) => sum + s.score, 0) / task.scores.length) * 10
        ) / 10
      : null);
  const displayScore =
    task.status === "COMPLETED" && task.finalScore !== null
      ? task.finalScore
      : calculatedAvg;
  const scoreLabel = task.status === "COMPLETED" ? "已发布评分" : "实时均分";
  const scoreFootnote =
    task.status === "COMPLETED" &&
    task.finalScore !== null &&
    calculatedAvg !== task.finalScore
      ? "手动设定"
      : `基于 ${task.scores.length} 个评分`;
  const canForcePublish =
    isSuperAdmin && task.photoReports.length === 0 && canForcePublishStatus(task.status);

  return (
    <div className="min-w-0 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 transition-all hover:border-[hsl(var(--primary)/0.2)] sm:p-5">
      {/* Header */}
      <div className="mb-3 rounded-lg bg-[hsl(var(--secondary)/0.25)] px-3 py-2.5">
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold leading-5 text-[hsl(var(--foreground))]">
            {task.ratedUserNickname || task.ratedUserQQ || truncateId(task.ratedUserId)}
          </p>
          <p className="mt-1 break-all text-xs text-[hsl(var(--muted-foreground))]">
            QQ: {task.ratedUserQQ || "—"}
          </p>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${badge.cls}`}
          >
            {badge.label}
          </span>
          <span className="text-[11px] text-[hsl(var(--muted-foreground))]">
            {formatDate(task.createdAt)}
          </span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-5">
          {timelineItems.map((item) => (
            <div
              key={item.label}
              className="min-w-0 rounded-md border border-[hsl(var(--border)/0.6)] bg-[hsl(var(--card)/0.35)] px-2 py-1"
            >
              <div className="truncate text-[10px] text-[hsl(var(--muted-foreground))]">
                {item.label}
              </div>
              <div className="truncate text-[11px] font-medium text-[hsl(var(--foreground))]">
                {formatDate(item.value)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Photos */}
      {task.photos.length > 0 && (
        <div className="mb-3 grid grid-cols-2 gap-2 rounded-lg bg-[hsl(var(--secondary)/0.3)] p-2 sm:flex sm:flex-wrap">
          {task.photos.map((photo, i) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => setLightboxIdx(i)}
              className="relative aspect-square overflow-hidden rounded-lg border border-[hsl(var(--border)/0.5)] transition-all hover:border-[hsl(var(--primary)/0.5)] hover:scale-[1.03] focus:outline-none sm:h-32 sm:w-32 sm:shrink-0"
            >
              <Image
                src={photo.thumbUrl ?? photo.url}
                alt={`照片 ${photo.order + 1}`}
                fill
                unoptimized
                sizes="(min-width: 640px) 128px, 50vw"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}

      {/* Photo lightbox */}
      {lightboxIdx !== null && (
        <PhotoLightbox
          photos={task.photos}
          initialIndex={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
        />
      )}

      {/* Progress bar */}
      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between text-xs text-[hsl(var(--muted-foreground))]">
          <span>评分进度</span>
          <span>
            {task.scoredCount} / {task.totalScorers} ({progressPct}%)
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-[hsl(var(--secondary))]">
          <div
            className="h-full rounded-full bg-brand-blue transition-all duration-500 shadow-sm shadow-brand-blue/20"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Live / published score */}
      {displayScore !== null && (
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-[hsl(var(--secondary)/0.5)] px-3 py-2">
          <span className="text-xs text-[hsl(var(--muted-foreground))]">
            {scoreLabel}:
          </span>
          <span className={`text-lg font-bold ${scoreColor(displayScore)}`}>
            {displayScore.toFixed(1)}
          </span>
          <span className="text-xs text-[hsl(var(--muted-foreground))]">/ 10</span>
          <span className="ml-auto text-[11px] text-[hsl(var(--muted-foreground))]">
            {scoreFootnote}
          </span>
        </div>
      )}

      {/* Scorer details */}
      <div className="mb-3">
        <p className="mb-2 text-xs font-medium text-[hsl(var(--muted-foreground))]">
          评分详情:
        </p>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {/* Scored entries */}
          {task.scores.map((s) => (
            <div
              key={s.id}
              className="flex min-w-0 items-center justify-between rounded-md bg-[hsl(var(--secondary)/0.3)] px-2.5 py-1.5"
            >
              <span className="truncate text-xs text-[hsl(var(--foreground))]">
                {s.scorerNickname || s.scorerQQ || truncateId(s.scorerUserId)}
              </span>
              <span className={`ml-2 shrink-0 text-xs font-bold ${scoreColor(s.score)}`}>
                {s.score.toFixed(1)}
              </span>
            </div>
          ))}

          {/* Unscored entries */}
          {task.scorerSnapshot
            .filter((id) => !scoredUserIds.has(id))
            .map((id) => {
              const info = task.scorerNames?.[id];
              const displayName = info?.nickname || info?.qq || truncateId(id);
              return (
                <div
                  key={id}
                  className="flex min-w-0 items-center justify-between rounded-md bg-[hsl(var(--secondary)/0.15)] px-2.5 py-1.5"
                >
                  <span className="truncate text-xs text-[hsl(var(--muted-foreground))]">
                    {displayName}
                  </span>
                  <span className="ml-2 shrink-0 text-[10px] text-[hsl(var(--muted-foreground))]">
                    未评分
                  </span>
                </div>
              );
            })}
        </div>
      </div>

      {/* Review alert & Pending decision countdown */}
      {task.status === "REVIEW" && isSuperAdmin && (
        <>
          {task.pendingActionType ? (
            <div className="mb-3 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-1.5 text-xs font-medium text-blue-400 sm:items-center">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                  </span>
                  <span>
                    {task.pendingActionType === "APPROVE"
                      ? "已提交「通过并发布」，将在倒计时结束后生效"
                      : `已提交「直接设定评分 ${task.pendingActionValue?.toFixed(1)} 分」，将在倒计时结束后生效`}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <span className="font-mono text-sm font-semibold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                    {timeLeft || "05:00"}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRevoke && onRevoke(task.id)}
                    className="rounded-lg bg-red-500/15 border border-red-500/30 px-3 py-1 text-xs font-medium text-red-400 transition-all hover:bg-red-500/25"
                  >
                    撤销决定
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="mb-3 rounded-lg border border-orange-500/30 bg-orange-500/10 px-4 py-3">
              <p className="mb-2 text-xs font-medium text-orange-400">
                ⚠️ 该用户的评分已完成，需要超级管理员审核后才会发布给用户
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onApprove(task.id)}
                  className="flex items-center rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-3 py-1.5 text-xs font-medium text-emerald-400 transition-all hover:bg-emerald-500/25"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="mr-1 h-3.5 w-3.5 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  通过并发布
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("确定要重置评分吗？所有已提交的评分将被清除。")) {
                      onRescore(task.id);
                    }
                  }}
                  className="flex items-center rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-400 transition-all hover:bg-amber-500/20"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="mr-1 h-3.5 w-3.5 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round"
                  >
                    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                    <path d="M16 16h5v5" />
                  </svg>
                  重新评分
                </button>
                <OverrideScoreInput onSubmit={(score) => onOverride(task.id, score)} />
              </div>
            </div>
          )}
        </>
      )}

      {/* Photo reports alert */}
      {task.photoReports.length > 0 && isSuperAdmin && (
        <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
          <p className="mb-2 text-xs font-medium text-red-400 flex items-center gap-1">
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round shrink-0"
            >
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
              <line x1="4" y1="22" x2="4" y2="15" />
            </svg>
            照片被举报 ({task.photoReports.length} 条)
          </p>
          <div className="space-y-1.5 mb-3">
            {task.photoReports.map((r, i) => {
              const info = task.scorerNames?.[r.reporterId];
              const name = info?.nickname || info?.qq || r.reporterId.slice(0, 8);
              return (
                <div key={i} className="rounded-md bg-red-500/5 px-3 py-2 text-xs">
                  <span className="font-medium text-[hsl(var(--foreground))]">
                    {name}:
                  </span>
                  <span className="ml-1.5 text-[hsl(var(--muted-foreground))]">
                    {r.reason}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                if (
                  confirm(
                    "确认照片违规并撤销该用户的照片吗？照片将被删除，用户会收到包含举报原因的通知。"
                  )
                ) {
                  onRevokePhotos(task.id);
                }
              }}
              className="flex items-center rounded-lg bg-red-500/15 border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-400 transition-all hover:bg-red-500/25"
            >
              <svg
                viewBox="0 0 24 24"
                className="mr-1 h-3.5 w-3.5 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round"
              >
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              违规，撤销照片
            </button>
            <button
              type="button"
              onClick={() => {
                if (
                  confirm(
                    "确认照片不违规并继续评分吗？举报记录将被清除，仅举报评分员和未评分评分员会收到重新评分任务。"
                  )
                ) {
                  onRescore(task.id, "reporters_and_unscored");
                }
              }}
              className="flex items-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 transition-all hover:bg-emerald-500/20"
            >
              <svg
                viewBox="0 0 24 24"
                className="mr-1 h-3.5 w-3.5 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round"
              >
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                <path d="M16 16h5v5" />
              </svg>
              不违规，重新评分
            </button>
          </div>
        </div>
      )}

      {/* Actions for non-REVIEW tasks — SUPER_ADMIN only */}
      {task.status !== "REVIEW" && task.photoReports.length === 0 && isSuperAdmin && (
        <div className="flex flex-wrap gap-2">
          {canForcePublish && (
            <>
              <button
                type="button"
                disabled={calculatedAvg === null}
                title={
                  calculatedAvg === null
                    ? "当前还没有评分，无法按实时均分发布"
                    : "终止当前打分并按实时均分直接发布"
                }
                onClick={() => {
                  if (calculatedAvg === null) return;
                  if (
                    confirm(
                      `确定要终止当前打分，并按实时均分 ${calculatedAvg.toFixed(
                        1
                      )} 分直接发布吗？未评分的评分员将不再继续评分。`
                    )
                  ) {
                    onApprove(task.id);
                  }
                }}
                className="flex items-center rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-3 py-1.5 text-xs font-medium text-emerald-400 transition-all hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="mr-1 h-3.5 w-3.5 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                终止并发布均分
              </button>
              <OverrideScoreInput onSubmit={(score) => onOverride(task.id, score)} />
            </>
          )}
          <button
            type="button"
            onClick={() => {
              if (
                confirm(
                  "确定要重置此用户的评分吗？所有已提交的评分将被清除，评分员需要重新评分。"
                )
              ) {
                onRescore(task.id);
              }
            }}
            className="flex items-center rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-400 transition-all hover:bg-amber-500/20"
          >
            <svg
              viewBox="0 0 24 24"
              className="mr-1 h-3.5 w-3.5 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round"
            >
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 16h5v5" />
            </svg>
            重新评分
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────── */

export default function ScoringAdminPage() {
  const pageBottomRef = useRef<HTMLDivElement>(null);
  const [tasks, setTasks] = useState<ScoringTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const pageSize = 20;

  // Check role on mount
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.data?.role === "SUPER_ADMIN") setIsSuperAdmin(true);
      })
      .catch(() => {});
  }, []);

  function clampPage(value: number) {
    const maxPage = Math.max(1, totalPages);
    return Math.min(Math.max(1, value), maxPage);
  }

  function goToPage(nextPage: number) {
    const clampedPage = clampPage(nextPage);
    setPage(clampedPage);
    setPageInput(String(clampedPage));
  }

  function handlePageJump(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextPage = Number.parseInt(pageInput, 10);
    if (Number.isNaN(nextPage)) {
      setPageInput(String(page));
      return;
    }

    goToPage(nextPage);
  }

  function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setPageInput("1");
  }

  const fetchTasks = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(pageSize),
        });
        if (search.trim()) params.set("search", search.trim());
        if (statusFilter) params.set("status", statusFilter);

        const res = await fetch(`/api/admin/scoring?${params}`);
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error?.message || "加载失败");
        }
        const data = await res.json();
        setTasks(data.data || []);
        if (data.pagination) {
          setTotalPages(data.pagination.totalPages);
          setTotal(data.pagination.total);
          if (data.pagination.totalPages > 0 && page > data.pagination.totalPages) {
            setPage(data.pagination.totalPages);
            setPageInput(String(data.pagination.totalPages));
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [page, search, statusFilter]
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void fetchTasks();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [fetchTasks]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      fetchTasks({ silent: true });
    }, 10000);
    return () => window.clearInterval(interval);
  }, [fetchTasks]);

  async function handleRescore(taskId: string, mode?: "reporters_and_unscored") {
    try {
      const res = await fetch(`/api/admin/scoring/${taskId}/rescore`, {
        method: "POST",
        headers: mode ? { "Content-Type": "application/json" } : undefined,
        body: mode ? JSON.stringify({ mode }) : undefined,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "操作失败");
      fetchTasks();
    } catch (err) {
      alert(err instanceof Error ? err.message : "操作失败");
    }
  }

  async function handleApprove(taskId: string) {
    try {
      const res = await fetch(`/api/admin/scoring/${taskId}/approve`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "操作失败");
      fetchTasks();
    } catch (err) {
      alert(err instanceof Error ? err.message : "操作失败");
    }
  }

  async function handleOverride(taskId: string, score: number) {
    try {
      const res = await fetch(`/api/admin/scoring/${taskId}/override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "操作失败");
      fetchTasks();
    } catch (err) {
      alert(err instanceof Error ? err.message : "操作失败");
    }
  }

  async function handleRevokePhotos(taskId: string) {
    try {
      const res = await fetch(`/api/admin/scoring/${taskId}/revoke-photos`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "操作失败");
      alert(data.data?.message || "照片已撤销，用户已收到通知");
      fetchTasks();
    } catch (err) {
      alert(err instanceof Error ? err.message : "操作失败");
    }
  }

  async function handleRevoke(taskId: string) {
    try {
      const res = await fetch(`/api/admin/scoring/${taskId}/revoke`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "操作失败");
      fetchTasks();
    } catch (err) {
      alert(err instanceof Error ? err.message : "操作失败");
    }
  }

  const [fixing, setFixing] = useState(false);

  async function handleFixStuck() {
    setFixing(true);
    try {
      const res = await fetch("/api/admin/scoring/fix-stuck", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "修复失败");
      const result = data.data;
      const debugStr =
        result.debug
          ?.map(
            (d: {
              taskId: string;
              status: string;
              snapshotLength: number;
              eligibleCount: number;
              scoredCount: number;
              promoted: boolean;
            }) =>
              `任务${d.taskId.slice(0, 6)}… 状态:${d.status} 快照:${d.snapshotLength} 有效:${d.eligibleCount} 已评:${d.scoredCount} → ${d.promoted ? "已修复" : "未修复"}`
          )
          .join("\n") || "";
      alert(`${result.message}\n\n${debugStr}`);
      fetchTasks();
    } catch (err) {
      alert(err instanceof Error ? err.message : "修复失败");
    } finally {
      setFixing(false);
    }
  }

  function scrollToPageBottom() {
    pageBottomRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">评分管理</h1>
        {isSuperAdmin && (
          <button
            type="button"
            disabled={fixing}
            onClick={handleFixStuck}
            className="w-fit rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-400 transition-all hover:bg-amber-500/20 disabled:opacity-50"
          >
            {fixing ? "修复中..." : "修复卡住的任务"}
          </button>
        )}
      </div>

      <form onSubmit={handleSearch} className="flex flex-col gap-2 sm:w-fit sm:flex-row">
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
            setPageInput("1");
          }}
          placeholder="搜索 QQ号 / 昵称..."
          className="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-3 py-2 text-sm text-[hsl(var(--foreground))] outline-none focus:border-[hsl(var(--primary))] sm:w-64"
        />
        <button
          type="submit"
          className="rounded-lg bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-white transition-all hover:scale-[1.02]"
        >
          搜索
        </button>
      </form>

      {/* Status tabs */}
      <div className="rounded-xl bg-[hsl(var(--secondary))] p-1">
        <div className="grid grid-cols-3 gap-1 sm:flex sm:flex-wrap">
          {STATUS_TABS.filter(
            (tab) => !("superOnly" in tab && tab.superOnly) || isSuperAdmin
          ).map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => {
                setStatusFilter(tab.value);
                setPage(1);
                setPageInput("1");
              }}
              className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-all sm:justify-start sm:px-4 ${
                statusFilter === tab.value
                  ? "bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-sm"
                  : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
              }`}
            >
              {tab.value === "REVIEW" && (
                <svg
                  viewBox="0 0 24 24"
                  className="h-3.5 w-3.5 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round text-amber-500"
                >
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <circle
                    cx="12"
                    cy="17"
                    r="1"
                    style={{ fill: "currentColor", stroke: "none" }}
                  />
                </svg>
              )}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="text-xs text-[hsl(var(--muted-foreground))]">
        共 {total} 个评分任务
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-[hsl(0,62%,50%/0.3)] bg-[hsl(0,62%,50%/0.1)] px-4 py-3 text-sm text-[hsl(0,62%,70%)]">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[hsl(var(--primary))] border-t-transparent" />
        </div>
      )}

      {/* Task cards */}
      {!loading && (
        <div className="space-y-3">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              isSuperAdmin={isSuperAdmin}
              onRescore={handleRescore}
              onApprove={handleApprove}
              onOverride={handleOverride}
              onRevokePhotos={handleRevokePhotos}
              onRevoke={handleRevoke}
            />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && tasks.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] py-16">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-brand-muted mb-3 [&_svg]:h-6 [&_svg]:w-6 [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-2 [&_svg]:stroke-linecap-round [&_svg]:stroke-linejoin-round">
            <svg viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="6" />
              <circle cx="12" cy="12" r="2" />
            </svg>
          </span>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">暂无评分任务</p>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-2 py-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => goToPage(page - 1)}
            className="rounded-lg border border-[hsl(var(--border))] px-3 py-1.5 text-sm font-medium text-[hsl(var(--foreground))] transition-all hover:bg-[hsl(var(--secondary))] disabled:opacity-40"
          >
            上一页
          </button>
          <span className="px-3 text-sm text-[hsl(var(--muted-foreground))]">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => goToPage(page + 1)}
            className="rounded-lg border border-[hsl(var(--border))] px-3 py-1.5 text-sm font-medium text-[hsl(var(--foreground))] transition-all hover:bg-[hsl(var(--secondary))] disabled:opacity-40"
          >
            下一页
          </button>
          <form onSubmit={handlePageJump} className="flex items-center gap-1.5">
            <label
              htmlFor="scoring-page-jump"
              className="text-sm text-[hsl(var(--muted-foreground))]"
            >
              跳至
            </label>
            <input
              id="scoring-page-jump"
              type="number"
              min={1}
              max={totalPages}
              value={pageInput}
              onChange={(event) => setPageInput(event.target.value)}
              className="h-8 w-16 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2 text-center text-sm font-medium text-[hsl(var(--foreground))] outline-none transition-all focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15"
            />
            <span className="text-sm text-[hsl(var(--muted-foreground))]">页</span>
            <button
              type="submit"
              className="rounded-lg border border-brand-blue/30 bg-blue-1 px-3 py-1.5 text-sm font-medium text-brand-blue transition-all hover:bg-brand-blue/15"
            >
              跳转
            </button>
          </form>
        </div>
      )}
      <div ref={pageBottomRef} aria-hidden="true" />
      <button
        type="button"
        aria-label="跳至页面底部"
        title="跳至页面底部"
        onClick={scrollToPageBottom}
        className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-brand-blue text-white shadow-lg shadow-brand-blue/25 ring-1 ring-white/30 transition-all hover:-translate-y-0.5 hover:bg-[#0958d9] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40 focus-visible:ring-offset-2 active:translate-y-0 md:bottom-6 md:right-6 md:h-11 md:w-11"
      >
        <ArrowDownToLine aria-hidden="true" className="h-5 w-5" strokeWidth={2.4} />
      </button>
    </div>
  );
}
