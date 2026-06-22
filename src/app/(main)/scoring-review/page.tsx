"use client";

import { useState, useEffect, useCallback } from "react";

/* ─── Types ──────────────────────────────────────────── */

interface ReviewPhoto {
  id: string;
  order: number;
  url: string;
}

interface ScoreEntry {
  id: string;
  scorerUserId: string;
  scorerNickname: string | null;
  scorerQQ: string | null;
  score: number;
  createdAt: string;
}

interface ReviewTask {
  id: string;
  ratedUserId: string;
  ratedUserNickname: string | null;
  ratedUserQQ: string | null;
  status: string;
  scores: ScoreEntry[];
  scoredCount: number;
  totalScorers: number;
  photos: ReviewPhoto[];
  createdAt: string;
  completedAt: string | null;
  finalScore: number | null;
  pendingActionType: string | null;
  pendingActionValue: number | null;
  pendingActionExpiresAt: string | null;
  pendingActionActorId: string | null;
}

/* ─── Countdown Component ────────────────────────────────── */

function PendingActionCountdown({
  expiresAt,
  onExpired,
}: {
  expiresAt: string;
  onExpired?: () => void;
}) {
  const [timeLeft, setTimeLeft] = useState("10:00");

  useEffect(() => {
    const targetTime = new Date(expiresAt).getTime();

    function updateTimer() {
      const now = new Date().getTime();
      const diff = targetTime - now;

      if (diff <= 0) {
        setTimeLeft("00:00");
        if (onExpired) onExpired();
        return;
      }

      const totalSec = Math.floor(diff / 1000);
      const m = Math.floor(totalSec / 60);
      const s = totalSec % 60;
      const mm = String(m).padStart(2, "0");
      const ss = String(s).padStart(2, "0");
      setTimeLeft(`${mm}:${ss}`);
    }

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, onExpired]);

  return (
    <span className="font-mono text-sm font-semibold text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded border border-blue-500/20 shrink-0 animate-pulse">
      {timeLeft}
    </span>
  );
}

/* ─── Component ──────────────────────────────────────── */

export default function ScoringReviewPage() {
  const [tasks, setTasks] = useState<ReviewTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"review" | "completed">("review");

  // Active review card state
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [overrideMode, setOverrideMode] = useState(false);
  const [overrideScore, setOverrideScore] = useState(5.0);
  const [submitting, setSubmitting] = useState(false);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const status = tab === "review" ? "REVIEW" : "COMPLETED";
      const res = await fetch(
        `/api/admin/scoring?status=${status}&pageSize=50`
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || "加载失败");
      }
      const data = await res.json();
      setTasks(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  function computeAverage(scores: ScoreEntry[]): number {
    if (scores.length === 0) return 0;
    const avg =
      scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
    return Math.round(avg * 10) / 10;
  }

  async function handleApprove(taskId: string) {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/scoring/${taskId}/approve`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "审核失败");
      }
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? {
                ...t,
                pendingActionType: "APPROVE",
                pendingActionValue: null,
                pendingActionExpiresAt: data.pendingActionExpiresAt || new Date(Date.now() + 10 * 60 * 1000).toISOString(),
              }
            : t
        )
      );
      setOverrideMode(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "审核失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleOverride(taskId: string) {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/scoring/${taskId}/override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score: overrideScore }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "修改失败");
      }
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? {
                ...t,
                pendingActionType: "OVERRIDE",
                pendingActionValue: overrideScore,
                pendingActionExpiresAt: data.pendingActionExpiresAt || new Date(Date.now() + 10 * 60 * 1000).toISOString(),
              }
            : t
        )
      );
      setOverrideMode(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "修改失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke(taskId: string) {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/scoring/${taskId}/revoke`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "撤销失败");
      }
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? {
                ...t,
                pendingActionType: null,
                pendingActionValue: null,
                pendingActionExpiresAt: null,
              }
            : t
        )
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "撤销失败");
    } finally {
      setSubmitting(false);
    }
  }

  const activeTask = tasks.find((t) => t.id === activeTaskId);

  return (
    <div className="flex flex-col gap-5">
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round text-brand-blue">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="m9 11 2 2 4-4" />
        </svg>
        评分审核
      </h1>
      <p className="text-sm text-[hsl(var(--muted-foreground))]">
        审核评分组提交的颜值评分，通过或修改后发布给用户。
      </p>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-[hsl(var(--secondary))] p-1">
        <button
          type="button"
          onClick={() => { setTab("review"); setActiveTaskId(null); }}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
            tab === "review"
              ? "bg-brand-blue text-white shadow-[0_4px_12px_rgba(22,119,255,0.15)]"
              : "text-brand-muted hover:bg-slate-100/50 hover:text-brand-text"
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          待审核
        </button>
        <button
          type="button"
          onClick={() => { setTab("completed"); setActiveTaskId(null); }}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
            tab === "completed"
              ? "bg-brand-blue text-white shadow-[0_4px_12px_rgba(22,119,255,0.15)]"
              : "text-brand-muted hover:bg-slate-100/50 hover:text-brand-text"
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          已审核
        </button>
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

      {/* Empty */}
      {!loading && !error && tasks.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] py-16">
          <div className="mb-3 text-[hsl(var(--muted-foreground))]">
            {tab === "review" ? (
              <svg viewBox="0 0 24 24" className="h-12 w-12 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
                <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-12 w-12 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
              </svg>
            )}
          </div>
          <h2 className="text-base font-semibold text-[hsl(var(--foreground))]">
            {tab === "review" ? "暂无待审核评分" : "暂无已审核记录"}
          </h2>
        </div>
      )}

      {/* Task list */}
      {!loading && tasks.length > 0 && (
        <div className="space-y-3">
          {tasks.map((task) => {
            const avg = computeAverage(task.scores);
            const isActive = activeTaskId === task.id;

            return (
              <div
                key={task.id}
                className={`rounded-2xl border bg-[hsl(var(--card))] transition-all ${
                  isActive
                    ? "border-[hsl(var(--primary)/0.5)]"
                    : "border-[hsl(var(--border))] hover:border-[hsl(var(--primary)/0.3)]"
                }`}
              >
                {/* Summary row — always visible */}
                <button
                  type="button"
                  onClick={() => {
                    setActiveTaskId(isActive ? null : task.id);
                    setPhotoIndex(0);
                    setOverrideMode(false);
                    setOverrideScore(avg);
                  }}
                  className="flex w-full items-center gap-3 p-4 text-left"
                >
                  {/* Thumbnail */}
                  {task.photos[0] ? (
                    <img
                       src={task.photos[0].url}
                      alt=""
                      className="h-14 w-14 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]">
                      <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
                        <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                        <circle cx="12" cy="13" r="3" />
                      </svg>
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-[hsl(var(--foreground))]">
                        {task.ratedUserNickname || "匿名用户"}
                      </span>
                      {task.ratedUserQQ && (
                        <span className="text-xs text-[hsl(var(--muted-foreground))]">
                          QQ: {task.ratedUserQQ}
                        </span>
                      )}
                      {task.pendingActionType && (
                        <span className="inline-flex items-center gap-1 rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                          {task.pendingActionType === "APPROVE" ? "待审核通过" : `待设定 ${task.pendingActionValue} 分`}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
                      <span>{task.scoredCount} 人评分</span>
                      <span>·</span>
                      <span>均分 {avg}</span>
                      {task.finalScore !== null && tab === "completed" && (
                        <>
                          <span>·</span>
                          <span className="text-amber-400">
                            最终 {task.finalScore}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Score badge */}
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                      avg >= 7
                        ? "bg-emerald-500/15 text-emerald-400"
                        : avg >= 5
                        ? "bg-amber-500/15 text-amber-400"
                        : "bg-[hsl(0,60%,50%/0.15)] text-[hsl(0,60%,65%)]"
                    }`}
                  >
                    {avg}
                  </div>
                </button>

                {/* Expanded detail */}
                {isActive && activeTask && (
                  <div className="border-t border-[hsl(var(--border))] p-4">
                    {/* Photo viewer */}
                    {activeTask.photos.length > 0 && (
                      <div className="mb-4">
                        <div className="relative overflow-hidden rounded-xl bg-black">
                          <img
                            src={activeTask.photos[photoIndex]?.url}
                            alt={`Photo ${photoIndex + 1}`}
                            className="mx-auto max-h-80 object-contain"
                          />
                          {activeTask.photos.length > 1 && (
                            <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
                              {activeTask.photos.map((_, i) => (
                                <button
                                  key={i}
                                  type="button"
                                  onClick={() => setPhotoIndex(i)}
                                  className={`h-2 w-2 rounded-full transition-all ${
                                    i === photoIndex
                                      ? "bg-white"
                                      : "bg-white/40"
                                  }`}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="mt-1 text-center text-xs text-[hsl(var(--muted-foreground))]">
                          {photoIndex + 1} / {activeTask.photos.length}
                        </div>
                      </div>
                    )}

                    {/* Individual scores */}
                    <div className="mb-4">
                      <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                        评分详情
                      </h4>
                      <div className="space-y-1">
                        {activeTask.scores.map((s) => (
                          <div
                            key={s.id}
                            className="flex items-center justify-between rounded-lg bg-[hsl(var(--secondary)/0.5)] px-3 py-2"
                          >
                            <span className="text-xs text-[hsl(var(--foreground))]">
                              {s.scorerNickname || s.scorerQQ || "评分员"}
                            </span>
                            <span
                              className={`text-sm font-semibold ${
                                s.score >= 7
                                  ? "text-emerald-400"
                                  : s.score >= 5
                                  ? "text-amber-400"
                                  : "text-[hsl(0,60%,65%)]"
                              }`}
                            >
                              {s.score}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 flex items-center justify-between rounded-lg bg-[hsl(var(--primary)/0.1)] px-3 py-2">
                        <span className="text-xs font-medium text-[hsl(var(--primary))]">
                          平均分
                        </span>
                        <span className="text-sm font-bold text-[hsl(var(--primary))]">
                          {avg}
                        </span>
                      </div>
                    </div>

                    {/* Actions (review tab only) & Pending countdown */}
                    {tab === "review" && (
                      <div className="space-y-3">
                        {activeTask.pendingActionType ? (
                          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                              <h4 className="text-sm font-medium text-blue-400">
                                {activeTask.pendingActionType === "APPROVE"
                                  ? "已提交通过，将在倒计时结束后生效"
                                  : `已提交直接设定最终评分为 ${activeTask.pendingActionValue} 分`}
                              </h4>
                              <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                                在此期间您可以撤销该决定。
                              </p>
                            </div>
                            <div className="flex items-center gap-3">
                              {activeTask.pendingActionExpiresAt && (
                                <PendingActionCountdown
                                  expiresAt={activeTask.pendingActionExpiresAt}
                                  onExpired={fetchTasks}
                                />
                              )}
                              <button
                                type="button"
                                disabled={submitting}
                                onClick={() => handleRevoke(activeTask.id)}
                                className="rounded-lg bg-red-500/15 border border-red-500/30 px-3.5 py-1.5 text-xs font-medium text-red-400 transition-all hover:bg-red-500/25 disabled:opacity-50 shrink-0"
                              >
                                撤销决定
                              </button>
                            </div>
                          </div>
                        ) : !overrideMode ? (
                          <div className="flex gap-3">
                            <button
                              type="button"
                              disabled={submitting}
                              onClick={() => handleApprove(activeTask.id)}
                              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 py-2.5 text-sm font-semibold text-white transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                            >
                              {submitting ? (
                                "处理中..."
                              ) : (
                                <>
                                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                  <span>通过 ({avg} 分)</span>
                                </>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setOverrideMode(true);
                                setOverrideScore(avg);
                              }}
                              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 py-2.5 text-sm font-semibold text-amber-400 transition-all hover:bg-amber-500/20"
                            >
                              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
                                <path d="M12 20h9" />
                                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                              </svg>
                              <span>修改评分</span>
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                            <h4 className="text-sm font-medium text-amber-400">
                              修改最终评分
                            </h4>
                            <div className="flex items-center gap-3">
                              <input
                                type="range"
                                min={0}
                                max={10}
                                step={0.1}
                                value={overrideScore}
                                onChange={(e) =>
                                  setOverrideScore(parseFloat(e.target.value))
                                }
                                className="flex-1 accent-amber-500"
                              />
                              <span className="w-10 text-center text-lg font-bold text-[hsl(var(--foreground))]">
                                {overrideScore}
                              </span>
                            </div>
                            <div className="flex gap-3">
                              <button
                                type="button"
                                onClick={() => setOverrideMode(false)}
                                className="flex-1 rounded-lg border border-[hsl(var(--border))] py-2 text-sm font-medium text-[hsl(var(--muted-foreground))] transition-all hover:bg-[hsl(var(--secondary))]"
                              >
                                取消
                              </button>
                              <button
                                type="button"
                                disabled={submitting}
                                onClick={() =>
                                  handleOverride(activeTask.id)
                                }
                                className="flex-1 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 py-2 text-sm font-semibold text-white transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                              >
                                {submitting
                                  ? "处理中..."
                                  : `确认修改为 ${overrideScore} 分`}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Completed info */}
                    {tab === "completed" && task.finalScore !== null && (
                      <div className="rounded-lg bg-emerald-500/10 px-4 py-3 text-center">
                        <span className="text-xs text-[hsl(var(--muted-foreground))]">
                          已审核 · 最终评分
                        </span>
                        <div className="text-2xl font-bold text-emerald-400">
                          {task.finalScore}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
