"use client";

import { useState, useEffect, useCallback } from "react";

/* ─── Types ──────────────────────────────────────────── */

interface TaskPhoto {
  id: string;
  order: number;
  url: string;
}

interface ScoringTask {
  id: string;
  status: string;
  createdAt: string;
  progress: { scored: number; total: number };
  photos: TaskPhoto[];
  // completed tab only
  myScore?: number;
  scoredAt?: string;
  finalScore?: number | null;
}

/* ─── Component ──────────────────────────────────────── */

export default function ScoringPage() {
  const [tab, setTab] = useState<"pending" | "completed">("pending");
  const [tasks, setTasks] = useState<ScoringTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Current index in the task list (page flipping)
  const [currentIndex, setCurrentIndex] = useState(0);

  // Photo viewer within current task
  const [photoIndex, setPhotoIndex] = useState(0);

  // Scoring state — 5 sub-items
  const [scores, setScores] = useState({
    contour: 5,      // 轮廓与骨相
    skin: 5,         // 皮肤状态
    harmony: 5,      // 五官和谐度
    styling: 5,      // 发型与造型
    charisma: 5,     // 气质与眼缘
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Weighted total: hardware (3 items avg) × 60% + software × 20% + subjective × 20%
  const hardwareAvg = (scores.contour + scores.skin + scores.harmony) / 3;
  const scoreValue = hardwareAvg * 0.6 + scores.styling * 0.2 + scores.charisma * 0.2;

  // Success flash
  const [showSuccess, setShowSuccess] = useState(false);

  // Report state
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);

  async function handleReport() {
    if (!currentTask || !reportReason.trim()) return;
    setReportSubmitting(true);
    try {
      const res = await fetch(`/api/scoring/tasks/${currentTask.id}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reportReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "举报失败");
      setShowReportModal(false);
      setReportReason("");
      alert("举报已提交，管理员将会审核");
    } catch (err) {
      alert(err instanceof Error ? err.message : "举报失败");
    } finally {
      setReportSubmitting(false);
    }
  }

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/scoring/tasks?status=${tab}`);
      if (!res.ok) {
        if (res.status === 403) {
          setError("无权访问评分功能");
          setTasks([]);
          return;
        }
        throw new Error("加载失败");
      }
      const data = await res.json();
      const fetched = data.data?.tasks || [];
      setTasks(fetched);
      setCurrentIndex(0);
      setPhotoIndex(0);
      setScores({ contour: 5, skin: 5, harmony: 5, styling: 5, charisma: 5 });
      setSubmitError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const currentTask = tasks[currentIndex] ?? null;
  const totalPending = tasks.length;

  async function handleSubmitScore() {
    if (!currentTask) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/scoring/tasks/${currentTask.id}/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score: Math.round(scoreValue * 10) / 10 }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "提交失败");
      }

      // Show success flash
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 800);

      // Move to next task or refresh
      const remaining = tasks.filter((_, i) => i !== currentIndex);
      if (remaining.length > 0) {
        setTasks(remaining);
        setCurrentIndex(0);
        setPhotoIndex(0);
        setScores({ contour: 5, skin: 5, harmony: 5, styling: 5, charisma: 5 });
        setSubmitError(null);
      } else {
        // No more tasks — refresh from API
        await fetchTasks();
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-pink-500 stroke-2 stroke-linecap-round stroke-linejoin-round shrink-0">
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="6" />
            <circle cx="12" cy="12" r="2" />
          </svg>
          评分任务
        </h1>
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[hsl(var(--primary))] border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-pink-500 stroke-2 stroke-linecap-round stroke-linejoin-round shrink-0">
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="6" />
            <circle cx="12" cy="12" r="2" />
          </svg>
          评分任务
        </h1>
        {tab === "pending" && totalPending > 0 && (
          <span className="rounded-full bg-[hsl(var(--primary)/0.15)] px-3 py-1 text-sm font-medium text-[hsl(var(--primary))]">
            剩余 {totalPending} 个
          </span>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 rounded-xl bg-blue-500/10 p-1">
        <button
          type="button"
          onClick={() => setTab("pending")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
            tab === "pending"
              ? "bg-brand-blue text-white shadow-[0_4px_12px_rgba(22,119,255,0.15)]"
              : "text-brand-muted hover:bg-slate-100/50 hover:text-brand-text"
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round shrink-0">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          待评分
        </button>
        <button
          type="button"
          onClick={() => setTab("completed")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
            tab === "completed"
              ? "bg-brand-blue text-white shadow-[0_4px_12px_rgba(22,119,255,0.15)]"
              : "text-brand-muted hover:bg-slate-100/50 hover:text-brand-text"
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round shrink-0">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          已评分
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-[hsl(0,62%,50%/0.3)] bg-[hsl(0,62%,50%/0.1)] px-4 py-3 text-sm text-[hsl(0,62%,70%)]">
          {error}
        </div>
      )}

      {/* Success flash overlay */}
      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="animate-bounce rounded-2xl bg-emerald-500 px-8 py-6 text-center shadow-2xl">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-white">
              <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current stroke-[2.5] stroke-linecap-round stroke-linejoin-round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div className="mt-2 text-lg font-bold text-white">评分已提交</div>
          </div>
        </div>
      )}

      {/* ══ PENDING TAB: Single card view ══ */}
      {tab === "pending" && (
        <>
          {/* Empty state */}
          {totalPending === 0 && !error && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] py-20">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 shrink-0">
                <svg viewBox="0 0 24 24" className="h-8 w-8 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <p className="text-base font-medium text-[hsl(var(--foreground))]">
                全部评分完成
              </p>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                暂无待评分任务
              </p>
            </div>
          )}

          {/* Current task card */}
          {currentTask && (
            <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden">
              {/* Photo area */}
              {currentTask.photos.length > 0 && (
                <div className="relative bg-black/30">
                  {/* Main photo */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={currentTask.photos[photoIndex]?.url}
                    alt="评分照片"
                    className="mx-auto h-[28rem] w-full object-contain"
                  />

                  {/* Photo navigation arrows */}
                  {currentTask.photos.length > 1 && (
                    <>
                      <button
                        onClick={() =>
                          setPhotoIndex((prev) =>
                            prev > 0 ? prev - 1 : currentTask.photos.length - 1
                          )
                        }
                        className="absolute left-2 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white/80 backdrop-blur-sm transition-all hover:bg-black/70 hover:text-white"
                      >
                        ‹
                      </button>
                      <button
                        onClick={() =>
                          setPhotoIndex((prev) =>
                            prev < currentTask.photos.length - 1 ? prev + 1 : 0
                          )
                        }
                        className="absolute right-2 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white/80 backdrop-blur-sm transition-all hover:bg-black/70 hover:text-white"
                      >
                        ›
                      </button>
                    </>
                  )}

                  {/* Photo counter */}
                  <div className="absolute top-3 right-3 rounded-full bg-black/60 px-3 py-1 text-xs text-white/90 backdrop-blur-sm">
                    {photoIndex + 1} / {currentTask.photos.length}
                  </div>

                  {/* Dots */}
                  {currentTask.photos.length > 1 && (
                    <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
                      {currentTask.photos.map((_, i) => (
                        <button
                          key={i}
                          onClick={() => setPhotoIndex(i)}
                          className={`h-2 w-2 rounded-full transition-all ${
                            photoIndex === i
                              ? "bg-white scale-125"
                              : "bg-white/40 hover:bg-white/70"
                          }`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Scoring controls */}
              <div className="p-5 space-y-5">

                {/* ── Hardware scores (60%) ── */}
                <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.3)] p-4 space-y-4">
                  <div className="text-xs font-semibold text-[hsl(var(--foreground))]">硬件分</div>

                  {/* 轮廓与骨相 */}
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-[hsl(var(--foreground))]">轮廓与骨相</span>
                      <span className="font-semibold tabular-nums text-[hsl(var(--primary))]">{scores.contour.toFixed(1)}</span>
                    </div>
                    <input
                      type="range" min={0} max={10} step={0.1}
                      value={scores.contour}
                      onChange={(e) => setScores(s => ({ ...s, contour: Number(e.target.value) }))}
                      className="slider-input w-full"
                    />
                  </div>

                  {/* 皮肤状态 */}
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-[hsl(var(--foreground))]">皮肤状态</span>
                      <span className="font-semibold tabular-nums text-[hsl(var(--primary))]">{scores.skin.toFixed(1)}</span>
                    </div>
                    <input
                      type="range" min={0} max={10} step={0.1}
                      value={scores.skin}
                      onChange={(e) => setScores(s => ({ ...s, skin: Number(e.target.value) }))}
                      className="slider-input w-full"
                    />
                  </div>

                  {/* 五官和谐度 */}
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-[hsl(var(--foreground))]">五官和谐度</span>
                      <span className="font-semibold tabular-nums text-[hsl(var(--primary))]">{scores.harmony.toFixed(1)}</span>
                    </div>
                    <input
                      type="range" min={0} max={10} step={0.1}
                      value={scores.harmony}
                      onChange={(e) => setScores(s => ({ ...s, harmony: Number(e.target.value) }))}
                      className="slider-input w-full"
                    />
                  </div>
                </div>

                {/* ── Software score (20%) ── */}
                <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.3)] p-4 space-y-4">
                  <div className="text-xs font-semibold text-[hsl(var(--foreground))]">软件分</div>

                  {/* 发型与造型 */}
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-[hsl(var(--foreground))]">发型与造型</span>
                      <span className="font-semibold tabular-nums text-[hsl(var(--primary))]">{scores.styling.toFixed(1)}</span>
                    </div>
                    <input
                      type="range" min={0} max={10} step={0.1}
                      value={scores.styling}
                      onChange={(e) => setScores(s => ({ ...s, styling: Number(e.target.value) }))}
                      className="slider-input w-full"
                    />
                  </div>
                </div>

                {/* ── Subjective score (20%) ── */}
                <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.3)] p-4 space-y-4">
                  <div className="text-xs font-semibold text-[hsl(var(--foreground))]">主观分</div>

                  {/* 气质与眼缘 */}
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-[hsl(var(--foreground))]">气质与眼缘</span>
                      <span className="font-semibold tabular-nums text-[hsl(var(--primary))]">{scores.charisma.toFixed(1)}</span>
                    </div>
                    <input
                      type="range" min={0} max={10} step={0.1}
                      value={scores.charisma}
                      onChange={(e) => setScores(s => ({ ...s, charisma: Number(e.target.value) }))}
                      className="slider-input w-full"
                    />
                  </div>
                </div>

                {submitError && (
                  <p className="text-center text-xs text-[hsl(0,62%,70%)]">{submitError}</p>
                )}

                {/* Submit button */}
                <button
                  type="button"
                  onClick={handleSubmitScore}
                  disabled={submitting}
                  className="w-full rounded-xl bg-gradient-to-r from-[#1677ff] to-[#0958d9] px-4 py-3 text-base font-bold text-white shadow-lg shadow-brand-blue/25 transition-all hover:scale-[1.01] hover:shadow-xl active:scale-[0.99] disabled:opacity-50"
                >
                  {submitting ? "提交中..." : "提交评分"}
                </button>

                {/* Report button */}
                <button
                  type="button"
                  onClick={() => setShowReportModal(true)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-xs text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(0,60%,65%)]"
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
                    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                    <line x1="4" y1="22" x2="4" y2="15" />
                  </svg>
                  举报异常照片
                </button>
              </div>
            </div>
          )}

          {/* Report modal */}
          {showReportModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowReportModal(false)}>
              <div className="w-full max-w-sm rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
                <h3 className="mb-1 text-base font-semibold text-[hsl(var(--foreground))]">举报异常照片</h3>
                <p className="mb-4 text-xs text-[hsl(var(--muted-foreground))]">
                  请描述照片存在的问题（如非本人照片、不雅内容、截图等）
                </p>
                <textarea
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  maxLength={200}
                  rows={3}
                  placeholder="请输入举报原因..."
                  className="mb-3 w-full resize-none rounded-lg border border-[hsl(var(--input))] bg-transparent px-3 py-2.5 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setShowReportModal(false); setReportReason(""); }}
                    className="flex-1 rounded-lg border border-[hsl(var(--border))] py-2 text-sm font-medium text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--secondary))]"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleReport}
                    disabled={reportSubmitting || !reportReason.trim()}
                    className="flex-1 rounded-lg bg-[hsl(0,60%,55%)] py-2 text-sm font-medium text-white transition-all hover:bg-[hsl(0,60%,50%)] disabled:opacity-50"
                  >
                    {reportSubmitting ? "提交中..." : "提交举报"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ══ COMPLETED TAB: Scrollable list ══ */}
      {tab === "completed" && (
        <>
          {tasks.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] py-16">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-500/10 text-blue-500 shrink-0">
                <svg viewBox="0 0 24 24" className="h-7 w-7 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
                  <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                  <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                </svg>
              </div>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                暂无已评分记录
              </p>
            </div>
          )}

          <div className="space-y-4">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden"
              >
                {/* Thumbnail photos */}
                {task.photos.length > 0 && (
                  <div className="relative bg-black/20">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={task.photos[0]?.url}
                      alt="已评分照片"
                      className="mx-auto h-48 w-full object-contain"
                    />
                  </div>
                )}

                {/* Scores */}
                <div className="p-4 flex items-center gap-4 bg-blue-100/80 dark:bg-blue-950/40 border-t border-blue-200/40">
                  <div className="rounded-lg bg-white dark:bg-slate-900 border border-blue-500/10 px-4 py-2 shadow-sm">
                    <div className="text-xs text-blue-600/80 dark:text-blue-400/80">我的评分</div>
                    <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                      {task.myScore?.toFixed(1)}
                    </div>
                  </div>
                  {task.finalScore !== null && task.finalScore !== undefined && (
                    <div className="rounded-lg bg-white dark:bg-slate-900 border border-blue-500/10 px-4 py-2 shadow-sm">
                      <div className="text-xs text-blue-600/80 dark:text-blue-400/80">最终分数</div>
                      <div className="flex items-center gap-1 text-lg font-bold text-amber-500">
                        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-amber-500 stroke-amber-500 stroke-2 stroke-linecap-round stroke-linejoin-round shrink-0">
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                        <span>{task.finalScore.toFixed(1)}</span>
                      </div>
                    </div>
                  )}
                  {task.status !== "COMPLETED" && (
                    <div className="rounded-lg bg-white dark:bg-slate-900 border border-blue-500/10 px-4 py-2 shadow-sm">
                      <div className="text-xs text-blue-500/70 font-medium">等待其他评分员</div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
