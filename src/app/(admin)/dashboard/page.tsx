"use client";

import { useState, useEffect } from "react";

/* ─── Types ──────────────────────────────────────────── */

interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  warnedUsers: number;
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

type ColorType = "blue" | "cyan" | "green" | "gold" | "rose" | "red" | "gray";

const colorStyles: Record<ColorType, { iconCls: string; textCls: string }> = {
  blue: { iconCls: "text-[#1677ff] bg-[#e6f4ff]", textCls: "text-[#1677ff]" },
  cyan: { iconCls: "text-[#13c2c2] bg-[#e6fffb]", textCls: "text-[#13c2c2]" },
  green: { iconCls: "text-[#52c41a] bg-[#f6ffed]", textCls: "text-[#52c41a]" },
  gold: { iconCls: "text-[#faad14] bg-[#fffbe6]", textCls: "text-[#faad14]" },
  rose: { iconCls: "text-[#eb2f96] bg-[#fff0f6]", textCls: "text-[#eb2f96]" },
  red: { iconCls: "text-[#ff4d4f] bg-[#fff1f0]", textCls: "text-[#ff4d4f]" },
  gray: { iconCls: "text-[#8c8c8c] bg-slate-100", textCls: "text-brand-muted" },
};

/* ─── Stat Card ──────────────────────────────────────── */
 
function StatCard({
  icon,
  label,
  value,
  color = "blue",
  desc,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color?: ColorType;
  desc?: string;
}) {
  const styles = colorStyles[color];
 
  return (
    <div className="min-h-[126px] rounded-[20px] border border-[#e9edf5] bg-white p-[18px] transition-all hover:border-[#1677ff]/30 hover:shadow-md">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[13px] font-semibold text-brand-muted">{label}</span>
        <span className={`flex h-[38px] w-[38px] items-center justify-center rounded-[14px] ${styles.iconCls} [&_svg]:h-[18px] [&_svg]:w-[18px] [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-2 [&_svg]:stroke-linecap-round [&_svg]:stroke-linejoin-round`}>
          {icon}
        </span>
      </div>
      <strong className={`block text-[34px] font-extrabold leading-[40px] ${styles.textCls}`}>
        {value}
      </strong>
      {desc && (
        <small className="mt-1.5 block text-xs leading-[18px] text-brand-subtle">
          {desc}
        </small>
      )}
    </div>
  );
}

/* ─── Section Header ─────────────────────────────────── */

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-brand-subtle">
      {title}
    </h2>
  );
}

/* ─── main page icons ────────────────────────────────── */

const UsersIcon = (
  <svg viewBox="0 0 24 24">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const UserCheckIcon = (
  <svg viewBox="0 0 24 24">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <polyline points="16 11 18 13 22 9" />
  </svg>
);

const AlertTriangleIcon = (
  <svg viewBox="0 0 24 24">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <circle cx="12" cy="17" r="1" style={{ fill: "currentColor", stroke: "none" }} />
  </svg>
);

const UserXIcon = (
  <svg viewBox="0 0 24 24">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <line x1="17" y1="8" x2="22" y2="13" />
    <line x1="22" y1="8" x2="17" y2="13" />
  </svg>
);

const AwardIcon = (
  <svg viewBox="0 0 24 24">
    <circle cx="12" cy="8" r="7" />
    <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
  </svg>
);

const HourglassIcon = (
  <svg viewBox="0 0 24 24">
    <path d="M5 2h14" />
    <path d="M5 22h14" />
    <path d="M19 2v4c0 4-3 7-7 7s-7-3-7-7V2" />
    <path d="M5 22v-4c0-4 3-7 7-7s7 3 7 7v4" />
  </svg>
);

const CalendarIcon = (
  <svg viewBox="0 0 24 24">
    <rect width="18" height="18" x="3" y="4" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
  </svg>
);

const ShieldAlertIcon = (
  <svg viewBox="0 0 24 24">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <circle cx="12" cy="16" r="1" style={{ fill: "currentColor", stroke: "none" }} />
  </svg>
);

const SearchIcon = (
  <svg viewBox="0 0 24 24">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

const CameraIcon = (
  <svg viewBox="0 0 24 24">
    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
    <circle cx="12" cy="13" r="3" />
  </svg>
);

const UserPlusIcon = (
  <svg viewBox="0 0 24 24">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <line x1="19" y1="8" x2="19" y2="14" />
    <line x1="16" y1="11" x2="22" y2="11" />
  </svg>
);

const HeartIcon = (
  <svg viewBox="0 0 24 24">
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
  </svg>
);

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
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-blue border-t-transparent" />
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
    <div className="space-y-8 px-2">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-brand-text">管理概览</h1>
        <p className="mt-1 text-sm text-brand-muted">统一查看成员状态、群认证、举报、评分任务和审计数据</p>
      </div>

      {/* User Overview */}
      <div>
        <SectionHeader title="用户概况" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={UsersIcon} label="总用户数" value={stats.totalUsers} color="blue" desc="注册用户总量" />
          <StatCard icon={UserCheckIcon} label="活跃用户" value={stats.activeUsers} color="green" desc="正常使用状态" />
          <StatCard icon={AlertTriangleIcon} label="被警告" value={stats.warnedUsers} color="gold" desc="限制部分访问权限" />
          <StatCard icon={UserXIcon} label="已封禁" value={stats.bannedUsers} color="red" desc="完全禁用账号" />
        </div>
      </div>

      {/* Membership */}
      <div>
        <SectionHeader title="群认证" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            icon={AwardIcon}
            label="已认证成员"
            value={stats.verifiedMembers}
            color="cyan"
            desc="群成员身份验证通过"
          />
          <StatCard
            icon={HourglassIcon}
            label="待审核"
            value={stats.pendingMembers}
            color="gold"
            desc="等待管理员核实信息"
          />
          <StatCard
            icon={CalendarIcon}
            label="已过期"
            value={stats.expiredMembers}
            color="gray"
            desc="群成员超过30天未验证"
          />
        </div>
      </div>

      {/* Content Review */}
      <div>
        <SectionHeader title="内容与评分" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            icon={ShieldAlertIcon}
            label="待处理举报"
            value={stats.pendingReports}
            color={stats.pendingReports > 0 ? "red" : "gray"}
            desc="待管理员核查的举报"
          />
          <StatCard
            icon={SearchIcon}
            label="审核中举报"
            value={stats.reviewingReports}
            color="gold"
            desc="进行二次复核的举报"
          />
          <StatCard
            icon={CameraIcon}
            label="评分任务"
            value={stats.scoringInProgress}
            color="rose"
            desc="评分进行中的照片队列"
          />
        </div>
      </div>

      {/* Today */}
      <div>
        <SectionHeader title="今日新增数据" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StatCard
            icon={UserPlusIcon}
            label="今日新用户"
            value={stats.todayNewUsers}
            color="blue"
            desc="今日新增账号注册"
          />
          <StatCard
            icon={HeartIcon}
            label="今日匹配"
            value={stats.todayMatches}
            color="rose"
            desc="今日产生双向配对数量"
          />
        </div>
      </div>
    </div>
  );
}
