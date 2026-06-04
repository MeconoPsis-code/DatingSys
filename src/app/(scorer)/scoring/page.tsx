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

  // Scoring state
  const [scoreValue, setScoreValue] = useState(5.0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Success flash
  const [showSuccess, setShowSuccess] = useState(false);

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
      setScoreValue(5.0);
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
        body: JSON.stringify({ score: scoreValue }),
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
        setScoreValue(5.0);
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
        <h1 className="text-2xl font-bold">🎯 评分任务</h1>
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
        <h1 className="text-2xl font-bold">🎯 评分任务</h1>
        {tab === "pending" && totalPending > 0 && (
          <span className="rounded-full bg-[hsl(var(--primary)/0.15)] px-3 py-1 text-sm font-medium text-[hsl(var(--primary))]">
            剩余 {totalPending} 个
          </span>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 rounded-xl bg-[hsl(var(--secondary))] p-1">
        <button
          onClick={() => setTab("pending")}
          className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
            tab === "pending"
              ? "bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-sm"
              : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
          }`}
        >
          待评分
        </button>
        <button
          onClick={() => setTab("completed")}
          className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
            tab === "completed"
              ? "bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-sm"
              : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
          }`}
        >
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
            <div className="text-4xl">✅</div>
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
              <div className="mb-3 text-5xl">✅</div>
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
              <div className="p-5 space-y-4">
                {/* Score display */}
                <div className="text-center">
                  <div className="text-4xl font-bold text-[hsl(var(--primary))]">
                    {scoreValue.toFixed(1)}
                  </div>
                  <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                    评分
                  </div>
                </div>

                {/* Score slider */}
                <div className="space-y-1">
                  <input
                    type="range"
                    min={0}
                    max={10}
                    step={0.5}
                    value={scoreValue}
                    onChange={(e) => setScoreValue(Number(e.target.value))}
                    className="w-full accent-[hsl(var(--primary))] h-2"
                  />
                  <div className="flex justify-between text-[10px] text-[hsl(var(--muted-foreground))]">
                    <span>0</span>
                    <span>2</span>
                    <span>4</span>
                    <span>6</span>
                    <span>8</span>
                    <span>10</span>
                  </div>
                </div>

                {/* Quick select buttons */}
                <div className="flex justify-center gap-1.5">
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setScoreValue(s)}
                      className={`h-9 w-9 rounded-lg border text-xs font-semibold transition-all ${
                        Math.floor(scoreValue) === s
                          ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.2)] text-[hsl(var(--primary))]"
                          : "border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--primary)/0.5)]"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>

                {submitError && (
                  <p className="text-center text-xs text-[hsl(0,62%,70%)]">{submitError}</p>
                )}

                {/* Submit button */}
                <button
                  type="button"
                  onClick={handleSubmitScore}
                  disabled={submitting}
                  className="w-full rounded-xl bg-gradient-to-r from-[hsl(262,83%,58%)] to-[hsl(290,70%,55%)] px-4 py-3 text-base font-bold text-white shadow-lg shadow-[hsl(262,83%,58%)/0.25] transition-all hover:scale-[1.01] hover:shadow-xl active:scale-[0.99] disabled:opacity-50"
                >
                  {submitting ? "提交中..." : `提交评分 ${scoreValue.toFixed(1)} 分`}
                </button>
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
              <div className="mb-3 text-4xl">📋</div>
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
                <div className="p-4 flex items-center gap-4">
                  <div className="rounded-lg bg-[hsl(var(--secondary))] px-4 py-2">
                    <div className="text-xs text-[hsl(var(--muted-foreground))]">我的评分</div>
                    <div className="text-lg font-bold text-[hsl(var(--foreground))]">
                      {task.myScore?.toFixed(1)}
                    </div>
                  </div>
                  {task.finalScore !== null && task.finalScore !== undefined && (
                    <div className="rounded-lg bg-[hsl(var(--secondary))] px-4 py-2">
                      <div className="text-xs text-[hsl(var(--muted-foreground))]">最终分数</div>
                      <div className="text-lg font-bold text-amber-400">
                        ⭐ {task.finalScore.toFixed(1)}
                      </div>
                    </div>
                  )}
                  {task.status !== "COMPLETED" && (
                    <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 px-4 py-2">
                      <div className="text-xs text-blue-400">等待其他评分员</div>
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
