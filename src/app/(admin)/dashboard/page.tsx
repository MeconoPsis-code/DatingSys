"use client";

import { useState, useEffect } from "react";

/* ─── Types ──────────────────────────────────────────── */

interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  frozenUsers: number;
  bannedUsers: number;
  verifiedMembers: number;
  pendingMembers: number;
  expiredMembers: number;
  pendingReports: number;
  reviewingReports: number;
  scoringInProgress: number;
  todayNewUsers: number;
  todayMatches: number;
}

/* ─── Stat Card ──────────────────────────────────────── */

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: string;
  label: string;
  value: number;
  accent?: string;
}) {
  const accentClass = accent || "text-[hsl(var(--foreground))]";

  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 transition-all hover:border-[hsl(var(--primary)/0.3)]">
      <div className="mb-2 text-2xl">{icon}</div>
      <p className="text-xs text-[hsl(var(--muted-foreground))]">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accentClass}`}>{value}</p>
    </div>
  );
}

/* ─── Section Header ─────────────────────────────────── */

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
      {title}
    </h2>
  );
}

/* ─── Main Page ──────────────────────────────────────── */

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch("/api/admin/stats");
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error?.message || "加载失败");
        }
        const data = await res.json();
        setStats(data.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败");
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[hsl(var(--primary))] border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-[hsl(0,62%,50%/0.3)] bg-[hsl(0,62%,50%/0.1)] px-4 py-3 text-sm text-[hsl(0,62%,70%)]">
        {error}
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">
        📊 管理概览
      </h1>

      {/* User Overview */}
      <div>
        <SectionHeader title="用户概况" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon="👥" label="总用户数" value={stats.totalUsers} />
          <StatCard
            icon="✅"
            label="活跃用户"
            value={stats.activeUsers}
            accent="text-emerald-400"
          />
          <StatCard
            icon="🧊"
            label="已冻结"
            value={stats.frozenUsers}
            accent="text-blue-400"
          />
          <StatCard
            icon="🚫"
            label="已封禁"
            value={stats.bannedUsers}
            accent="text-red-400"
          />
        </div>
      </div>

      {/* Membership */}
      <div>
        <SectionHeader title="群认证" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            icon="🏅"
            label="已认证"
            value={stats.verifiedMembers}
            accent="text-emerald-400"
          />
          <StatCard
            icon="⏳"
            label="待审核"
            value={stats.pendingMembers}
            accent="text-amber-400"
          />
          <StatCard
            icon="📅"
            label="已过期"
            value={stats.expiredMembers}
            accent="text-[hsl(var(--muted-foreground))]"
          />
        </div>
      </div>

      {/* Content Review */}
      <div>
        <SectionHeader title="内容审核" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            icon="🚨"
            label="待处理举报"
            value={stats.pendingReports}
            accent={stats.pendingReports > 0 ? "text-red-400" : undefined}
          />
          <StatCard
            icon="🔍"
            label="审核中举报"
            value={stats.reviewingReports}
            accent="text-amber-400"
          />
          <StatCard
            icon="📷"
            label="评分进行中"
            value={stats.scoringInProgress}
            accent="text-purple-400"
          />
        </div>
      </div>

      {/* Today */}
      <div>
        <SectionHeader title="今日数据" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StatCard
            icon="🆕"
            label="今日新用户"
            value={stats.todayNewUsers}
            accent="text-[hsl(var(--primary))]"
          />
          <StatCard
            icon="💕"
            label="今日匹配"
            value={stats.todayMatches}
            accent="text-pink-400"
          />
        </div>
      </div>
    </div>
  );
}
