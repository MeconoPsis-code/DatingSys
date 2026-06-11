"use client";

import { useState, useEffect, useCallback } from "react";

/* ─── Lightbox ───────────────────────────────────────── */

function PhotoLightbox({
  photos,
  initialIndex,
  onClose,
}: {
  photos: { id: string; url: string; order: number }[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(initialIndex);
  const photo = photos[idx];

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && idx > 0) setIdx(idx - 1);
      if (e.key === "ArrowRight" && idx < photos.length - 1) setIdx(idx + 1);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [idx, photos.length, onClose]);

  if (!photo) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] max-w-[90vw]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          className="absolute -right-2 -top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-[hsl(var(--card))] text-sm text-[hsl(var(--foreground))] shadow-lg border border-[hsl(var(--border))] hover:bg-[hsl(var(--secondary))]"
        >
          ✕
        </button>

        {/* Image */}
        <img
          src={photo.url}
          alt={`照片 ${photo.order + 1}`}
          className="max-h-[85vh] max-w-[85vw] rounded-xl object-contain"
        />

        {/* Nav arrows */}
        {photos.length > 1 && (
          <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-between px-2">
            <button
              type="button"
              disabled={idx <= 0}
              onClick={() => setIdx(idx - 1)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-all hover:bg-black/70 disabled:opacity-20"
            >
              ‹
            </button>
            <button
              type="button"
              disabled={idx >= photos.length - 1}
              onClick={() => setIdx(idx + 1)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-all hover:bg-black/70 disabled:opacity-20"
            >
              ›
            </button>
          </div>
        )}

        {/* Counter */}
        <div className="mt-2 text-center text-xs text-gray-400">
          {idx + 1} / {photos.length}
        </div>
      </div>
    </div>
  );
}

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
  finalScore: number | null;
}

/* ─── Constants ──────────────────────────────────────── */

const STATUS_TABS = [
  { value: "", label: "全部" },
  { value: "REVIEW", label: "⚠️ 待审核", superOnly: true },
  { value: "PENDING", label: "待评分" },
  { value: "SCORING", label: "评分中" },
  { value: "COMPLETED", label: "已完成" },
] as const;

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "待评分", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  SCORING: { label: "评分中", cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  REVIEW: { label: "待审核", cls: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  COMPLETED: { label: "已完成", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
};

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
        className="rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-1.5 text-xs font-medium text-purple-400 transition-all hover:bg-purple-500/20"
      >
        ✏️ 直接设定分数
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        min="0"
        max="10"
        step="0.5"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-16 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2 py-1 text-xs text-[hsl(var(--foreground))] focus:border-[hsl(var(--primary))] focus:outline-none"
      />
      <button
        type="button"
        onClick={() => {
          const n = parseFloat(value);
          if (isNaN(n) || n < 0 || n > 10 || n * 2 !== Math.round(n * 2)) {
            alert("评分必须在 0-10 之间，步长 0.5");
            return;
          }
          if (confirm(`确定将最终评分设为 ${n.toFixed(1)} 分？`)) {
            onSubmit(n);
            setOpen(false);
          }
        }}
        className="rounded-md bg-purple-500/20 px-2 py-1 text-xs font-medium text-purple-400 transition-all hover:bg-purple-500/30"
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
}: {
  task: ScoringTask;
  isSuperAdmin: boolean;
  onRescore: (taskId: string) => void;
  onApprove: (taskId: string) => void;
  onOverride: (taskId: string, score: number) => void;
}) {
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const badge = STATUS_BADGE[task.status] || { label: task.status, cls: "" };
  const progress = task.totalScorers > 0 ? task.scoredCount / task.totalScorers : 0;
  const progressPct = Math.round(progress * 100);

  // Map scored user IDs
  const scoredUserIds = new Set(task.scores.map((s) => s.scorerUserId));

  // Use API-provided finalScore (which includes overrides), fall back to calculated average
  const calculatedAvg =
    task.scores.length > 0
      ? Math.round((task.scores.reduce((sum, s) => sum + s.score, 0) / task.scores.length) * 10) / 10
      : null;
  const avgScore = task.finalScore ?? calculatedAvg;

  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 transition-all hover:border-[hsl(var(--primary)/0.2)]">
      {/* Header */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[hsl(var(--foreground))]">
              {task.ratedUserNickname || task.ratedUserQQ || truncateId(task.ratedUserId)}
            </span>
            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${badge.cls}`}>
              {badge.label}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
            QQ: {task.ratedUserQQ || "—"}
          </p>
        </div>
        <span className="shrink-0 text-[11px] text-[hsl(var(--muted-foreground))]">
          {formatDate(task.createdAt)}
        </span>
      </div>

      {/* Photos */}
      {task.photos.length > 0 && (
        <div className="mb-3 flex gap-2 overflow-x-auto rounded-lg bg-[hsl(var(--secondary)/0.3)] p-2">
          {task.photos.map((photo, i) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => setLightboxIdx(i)}
              className="shrink-0 overflow-hidden rounded-lg border border-[hsl(var(--border)/0.5)] transition-all hover:border-[hsl(var(--primary)/0.5)] hover:scale-[1.03] focus:outline-none"
            >
              <img
                src={photo.url}
                alt={`照片 ${photo.order + 1}`}
                className="h-32 w-32 object-cover"
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
            className="h-full rounded-full bg-gradient-to-r from-[hsl(262,83%,58%)] to-[hsl(290,70%,55%)] transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Completed average */}
      {(task.status === "COMPLETED" || task.status === "REVIEW") && avgScore !== null && (
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-[hsl(var(--secondary)/0.5)] px-3 py-2">
          <span className="text-xs text-[hsl(var(--muted-foreground))]">最终评分:</span>
          <span className={`text-lg font-bold ${scoreColor(avgScore)}`}>
            {avgScore.toFixed(1)}
          </span>
          <span className="text-xs text-[hsl(var(--muted-foreground))]">/ 10</span>
        </div>
      )}

      {/* Scorer details */}
      <div className="mb-3">
        <p className="mb-2 text-xs font-medium text-[hsl(var(--muted-foreground))]">评分详情:</p>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {/* Scored entries */}
          {task.scores.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between rounded-md bg-[hsl(var(--secondary)/0.3)] px-2.5 py-1.5"
            >
              <span className="truncate text-xs text-[hsl(var(--foreground))]">
                {s.scorerNickname || s.scorerQQ || truncateId(s.scorerUserId)}
              </span>
              <span className={`ml-2 text-xs font-bold ${scoreColor(s.score)}`}>
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
                  className="flex items-center justify-between rounded-md bg-[hsl(var(--secondary)/0.15)] px-2.5 py-1.5"
                >
                  <span className="truncate text-xs text-[hsl(var(--muted-foreground))]">
                    {displayName}
                  </span>
                  <span className="ml-2 text-[10px] text-[hsl(var(--muted-foreground))]">
                    未评分
                  </span>
                </div>
              );
            })}
        </div>
      </div>

      {/* Review alert */}
      {task.status === "REVIEW" && isSuperAdmin && (
        <div className="mb-3 rounded-lg border border-orange-500/30 bg-orange-500/10 px-4 py-3">
          <p className="mb-2 text-xs font-medium text-orange-400">
            ⚠️ 该用户评分 ≤ 6.0，需要超级管理员审核后才会发布给用户
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                if (confirm("确认通过此评分？评分将发布给用户。")) {
                  onApprove(task.id);
                }
              }}
              className="rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-3 py-1.5 text-xs font-medium text-emerald-400 transition-all hover:bg-emerald-500/25"
            >
              ✅ 通过并发布
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm("确定要重置评分吗？所有已提交的评分将被清除。")) {
                  onRescore(task.id);
                }
              }}
              className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-400 transition-all hover:bg-amber-500/20"
            >
              🔄 重新评分
            </button>
            <OverrideScoreInput onSubmit={(score) => onOverride(task.id, score)} />
          </div>
        </div>
      )}

      {/* Actions for non-REVIEW tasks — SUPER_ADMIN only */}
      {task.status !== "REVIEW" && isSuperAdmin && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              if (confirm("确定要重置此用户的评分吗？所有已提交的评分将被清除，评分员需要重新评分。")) {
                onRescore(task.id);
              }
            }}
            className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-400 transition-all hover:bg-amber-500/20"
          >
            🔄 重新评分
          </button>
          <OverrideScoreInput onSubmit={(score) => onOverride(task.id, score)} />
        </div>
      )}
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────── */

export default function ScoringAdminPage() {
  const [tasks, setTasks] = useState<ScoringTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
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

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
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
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  async function handleRescore(taskId: string) {
    try {
      const res = await fetch(`/api/admin/scoring/${taskId}/rescore`, { method: "POST" });
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

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">🎯 评分管理</h1>

      {/* Status tabs */}
      <div className="flex flex-wrap gap-1 rounded-xl bg-[hsl(var(--secondary))] p-1">
        {STATUS_TABS
          .filter((tab) => !('superOnly' in tab && tab.superOnly) || isSuperAdmin)
          .map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => { setStatusFilter(tab.value); setPage(1); }}
            className={`rounded-lg px-4 py-2 text-xs font-medium transition-all ${
              statusFilter === tab.value
                ? "bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-sm"
                : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="text-xs text-[hsl(var(--muted-foreground))]">共 {total} 个评分任务</div>

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
            />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && tasks.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] py-16">
          <div className="mb-3 text-4xl">🎯</div>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">暂无评分任务</p>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 py-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
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
            onClick={() => setPage(page + 1)}
            className="rounded-lg border border-[hsl(var(--border))] px-3 py-1.5 text-sm font-medium text-[hsl(var(--foreground))] transition-all hover:bg-[hsl(var(--secondary))] disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
