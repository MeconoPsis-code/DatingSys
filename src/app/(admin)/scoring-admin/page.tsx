"use client";

import { useState, useEffect, useCallback } from "react";

/* ─── Types ──────────────────────────────────────────── */

interface ScoreEntry {
  id: string;
  scorerUserId: string;
  scorerNickname: string | null;
  scorerQQ: string | null;
  score: number;
  createdAt: string;
}

interface ScoringTask {
  id: string;
  ratedUserId: string;
  ratedUserNickname: string | null;
  ratedUserQQ: string | null;
  photoObjectKey: string;
  status: string;
  scorerSnapshot: string[];
  scores: ScoreEntry[];
  scoredCount: number;
  totalScorers: number;
  completedAt: string | null;
  createdAt: string;
}

/* ─── Constants ──────────────────────────────────────── */

const STATUS_TABS = [
  { value: "", label: "全部" },
  { value: "PENDING", label: "待评分" },
  { value: "SCORING", label: "评分中" },
  { value: "COMPLETED", label: "已完成" },
];

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "待评分", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  SCORING: { label: "评分中", cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
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

/* ─── Task Card ──────────────────────────────────────── */

function TaskCard({
  task,
  isSuperAdmin,
  onRescore,
}: {
  task: ScoringTask;
  isSuperAdmin: boolean;
  onRescore: (taskId: string) => void;
}) {
  const badge = STATUS_BADGE[task.status] || { label: task.status, cls: "" };
  const progress = task.totalScorers > 0 ? task.scoredCount / task.totalScorers : 0;
  const progressPct = Math.round(progress * 100);

  // Map scored user IDs
  const scoredUserIds = new Set(task.scores.map((s) => s.scorerUserId));

  // Compute average from submitted scores
  const avgScore =
    task.scores.length > 0
      ? Math.round((task.scores.reduce((sum, s) => sum + s.score, 0) / task.scores.length) * 10) / 10
      : null;

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
      {task.status === "COMPLETED" && avgScore !== null && (
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
            .map((id) => (
              <div
                key={id}
                className="flex items-center justify-between rounded-md bg-[hsl(var(--secondary)/0.15)] px-2.5 py-1.5"
              >
                <span className="truncate text-xs text-[hsl(var(--muted-foreground))]">
                  {truncateId(id)}
                </span>
                <span className="ml-2 text-[10px] text-[hsl(var(--muted-foreground))]">
                  未评分
                </span>
              </div>
            ))}
        </div>
      </div>

      {/* Rescore button — SUPER_ADMIN only */}
      {isSuperAdmin && (
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

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">🎯 评分管理</h1>

      {/* Status tabs */}
      <div className="flex flex-wrap gap-1 rounded-xl bg-[hsl(var(--secondary))] p-1">
        {STATUS_TABS.map((tab) => (
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
