"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

/* ─── Types ──────────────────────────────────────────── */

interface Membership {
  id: string;
  userId: string;
  qqNumber: string;
  groupId: string;
  status: string;
  verifiedAt: string | null;

  leftDetectedAt: string | null;
  leftConfirmedAt: string | null;
  restoredAt: string | null;
  removedAt: string | null;
  leaveType: string | null;
  reviewReason: string | null;
  createdAt: string;
  userStatus: string;
  userRole: string;
  nickname: string | null;
  avatarUrl: string | null;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/* ─── Constants ──────────────────────────────────────── */

const STATUS_TABS: { value: string; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "VERIFIED", label: "已认证" },
  { value: "LEFT_PENDING_REVIEW", label: "待审核" },
  { value: "LEFT_CONFIRMED", label: "已确认退群" },
  { value: "REMOVED", label: "已移除" },
];

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  VERIFIED: { label: "已认证", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  PENDING: { label: "待审核", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  LEFT_PENDING_REVIEW: { label: "退群待审", cls: "bg-red-500/15 text-red-400 border-red-500/30" },
  LEFT_CONFIRMED: { label: "已退群", cls: "bg-red-600/15 text-red-500 border-red-600/30" },
  RESTORED: { label: "已恢复", cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  REMOVED: { label: "已移除", cls: "bg-gray-500/15 text-gray-400 border-gray-500/30" },
  REJECTED: { label: "已拒绝", cls: "bg-red-500/15 text-red-400 border-red-500/30" },
  REVOKED: { label: "已撤销", cls: "bg-red-500/15 text-red-400 border-red-500/30" },
};

const SELECTABLE_STATUSES = new Set(["LEFT_PENDING_REVIEW", "LEFT_CONFIRMED"]);

/* ─── Helpers ────────────────────────────────────────── */

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function Badge({ label, cls }: { label: string; cls: string }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

function AvatarFallback({ name }: { name: string }) {
  const letter = (name || "?").charAt(0).toUpperCase();
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#1677ff] to-[#0958d9] text-sm font-bold text-white">
      {letter}
    </div>
  );
}

/* ─── Purge Confirm Modal ────────────────────────────── */

function PurgeConfirmModal({
  count,
  onClose,
  onConfirm,
  submitting,
}: {
  count: number;
  onClose: () => void;
  onConfirm: () => void;
  submitting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-red-500/30 bg-[hsl(var(--card))] p-6 shadow-2xl">
        <h3 className="mb-1 text-base font-bold text-red-400">
          ⚠️ 批量清除确认
        </h3>
        <p className="mb-5 text-sm text-[hsl(var(--muted-foreground))]">
          即将清除 <span className="font-bold text-[hsl(var(--foreground))]">{count}</span> 位已退群成员的认证记录，此操作不可逆。
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 rounded-lg border border-[hsl(var(--border))] py-2.5 text-sm font-medium text-[hsl(var(--muted-foreground))] transition-all hover:bg-[hsl(var(--secondary))]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white transition-all hover:bg-red-500 disabled:opacity-40"
          >
            {submitting ? "处理中..." : "确认清除"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────── */

export default function MembershipPage() {
  const router = useRouter();

  /* auth */
  const [authed, setAuthed] = useState(false);

  /* data */
  const [members, setMembers] = useState<Membership[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* filters */
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  /* selection */
  const [selected, setSelected] = useState<Set<string>>(new Set());

  /* sync */
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  /* purge */
  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);
  const [purging, setPurging] = useState(false);
  const [purgeMsg, setPurgeMsg] = useState<{ text: string; ok: boolean } | null>(null);

  /* ─── Auth Check ─────────────────────────────────── */
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data || (data.data?.role !== "ADMIN" && data.data?.role !== "SUPER_ADMIN")) {
          router.push("/me");
          return;
        }
        setAuthed(true);
      })
      .catch(() => router.push("/me"));
  }, [router]);

  /* ─── Fetch Members ──────────────────────────────── */
  const fetchMembers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        pageSize: "20",
        status: statusFilter,
      });
      if (search.trim()) params.set("search", search.trim());

      const res = await fetch(`/api/admin/memberships?${params}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || "加载失败");
      }
      const data = await res.json();
      setMembers(data.data || []);
      if (data.pagination) {
        setPagination(data.pagination);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [pagination.page, statusFilter, search]);

  useEffect(() => {
    if (authed) fetchMembers();
  }, [authed, fetchMembers]);

  /* ─── Handlers ───────────────────────────────────── */

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPagination((p) => ({ ...p, page: 1 }));
    setSelected(new Set());
  }

  function handleStatusTab(val: string) {
    setStatusFilter(val);
    setPagination((p) => ({ ...p, page: 1 }));
    setSelected(new Set());
  }

  function handlePage(newPage: number) {
    setPagination((p) => ({ ...p, page: newPage }));
    setSelected(new Set());
  }

  /* selection */
  const selectableMembers = members.filter((m) => SELECTABLE_STATUSES.has(m.status));
  const allSelectableChecked = selectableMembers.length > 0 && selectableMembers.every((m) => selected.has(m.id));

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelectableChecked) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectableMembers.map((m) => m.id)));
    }
  }

  /* sync */
  async function handleSync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch("/api/bot/sync-members?force=true", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "同步失败");
      setSyncMsg({ text: "群成员同步完成", ok: true });
      setLastSyncTime(new Date().toLocaleString("zh-CN"));
      fetchMembers();
    } catch (err) {
      setSyncMsg({ text: err instanceof Error ? err.message : "同步失败", ok: false });
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(null), 4000);
    }
  }

  /* purge */
  async function handlePurge() {
    setPurging(true);
    setPurgeMsg(null);
    try {
      const ids = Array.from(selected);
      const res = await fetch("/api/admin/memberships/batch-purge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipIds: ids }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "清除失败");
      const result = data.data;
      setPurgeMsg({ text: `成功清除 ${result.purged} 条记录`, ok: true });
      setSelected(new Set());
      setShowPurgeConfirm(false);
      fetchMembers();
    } catch (err) {
      setPurgeMsg({ text: err instanceof Error ? err.message : "清除失败", ok: false });
      setShowPurgeConfirm(false);
    } finally {
      setPurging(false);
      setTimeout(() => setPurgeMsg(null), 4000);
    }
  }

  /* ─── Render ─────────────────────────────────────── */

  if (!authed) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-blue border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* ─── Header ──────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-[hsl(var(--foreground))]">
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round text-brand-blue">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            群认证管理
          </h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            共 {pagination.total} 条记录
            {lastSyncTime && <span className="ml-2">· 上次同步: {lastSyncTime}</span>}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {syncMsg && (
            <span className={`text-xs font-medium ${syncMsg.ok ? "text-emerald-400" : "text-red-400"}`}>
              {syncMsg.text}
            </span>
          )}
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-blue px-4 py-2 text-sm font-medium text-white transition-all hover:bg-brand-blue/90 disabled:opacity-50"
          >
            {syncing ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
            )}
            同步群成员
          </button>
        </div>
      </div>

      {/* ─── Filters ─────────────────────────────────── */}
      <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
        {/* Status tabs */}
        <div className="mb-4 flex flex-wrap gap-2">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => handleStatusTab(tab.value)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                statusFilter === tab.value
                  ? "border-brand-blue bg-brand-blue/15 text-brand-blue"
                  : "border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:border-brand-blue/30 hover:text-[hsl(var(--foreground))]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <svg
              viewBox="0 0 24 24"
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 fill-none stroke-[hsl(var(--muted-foreground))] stroke-2 stroke-linecap-round stroke-linejoin-round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="搜索 QQ号 / 昵称..."
              className="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] py-2 pl-9 pr-3 text-sm text-[hsl(var(--foreground))] outline-none transition-colors focus:border-[hsl(var(--ring))]"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-brand-blue px-4 py-2 text-sm font-medium text-white transition-all hover:bg-brand-blue/90"
          >
            搜索
          </button>
        </form>
      </div>

      {/* ─── Messages ────────────────────────────────── */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}
      {purgeMsg && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${purgeMsg.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-red-500/30 bg-red-500/10 text-red-400"}`}>
          {purgeMsg.text}
        </div>
      )}

      {/* ─── Loading ─────────────────────────────────── */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-blue border-t-transparent" />
        </div>
      )}

      {/* ─── Member List ─────────────────────────────── */}
      {!loading && members.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[hsl(var(--border))] text-left text-xs text-[hsl(var(--muted-foreground))]">
                {selectableMembers.length > 0 && (
                  <th className="px-4 py-3 font-medium">
                    <input
                      type="checkbox"
                      checked={allSelectableChecked}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 cursor-pointer rounded border-[hsl(var(--border))] accent-brand-blue"
                    />
                  </th>
                )}
                <th className="px-4 py-3 font-medium">成员</th>
                <th className="px-4 py-3 font-medium">QQ号</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">认证时间</th>

              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const badge = STATUS_BADGE[m.status] || { label: m.status, cls: "bg-gray-500/15 text-gray-400 border-gray-500/30" };
                const isSelectable = SELECTABLE_STATUSES.has(m.status);
                const isSelected = selected.has(m.id);

                return (
                  <tr
                    key={m.id}
                    className={`border-b border-[hsl(var(--border)/0.5)] transition-colors hover:bg-[hsl(var(--secondary)/0.5)] ${
                      isSelected ? "bg-brand-blue/5" : ""
                    }`}
                  >
                    {selectableMembers.length > 0 && (
                      <td className="px-4 py-3">
                        {isSelectable ? (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(m.id)}
                            className="h-4 w-4 cursor-pointer rounded border-[hsl(var(--border))] accent-brand-blue"
                          />
                        ) : (
                          <span className="inline-block h-4 w-4" />
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {m.avatarUrl ? (
                          <img
                            src={m.avatarUrl}
                            alt={m.nickname || m.qqNumber}
                            className="h-10 w-10 rounded-full object-cover"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              const target = e.currentTarget;
                              target.style.display = "none";
                              (target.nextElementSibling as HTMLElement)?.classList.remove("hidden");
                            }}
                          />
                        ) : null}
                        <div className={m.avatarUrl ? "hidden" : ""}>
                          <AvatarFallback name={m.nickname || m.qqNumber} />
                        </div>
                        <span className="font-medium text-[hsl(var(--foreground))]">
                          {m.nickname || "—"}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[hsl(var(--muted-foreground))]">
                      {m.qqNumber}
                    </td>
                    <td className="px-4 py-3">
                      <Badge label={badge.label} cls={badge.cls} />
                    </td>
                    <td className="px-4 py-3 text-xs text-[hsl(var(--muted-foreground))]">
                      {formatDate(m.verifiedAt)}
                    </td>

                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Empty State ─────────────────────────────── */}
      {!loading && members.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] py-16">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]">
            <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </span>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">未找到匹配的成员记录</p>
        </div>
      )}

      {/* ─── Pagination ──────────────────────────────── */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 py-2">
          <button
            type="button"
            disabled={pagination.page <= 1}
            onClick={() => handlePage(pagination.page - 1)}
            className="rounded-lg border border-[hsl(var(--border))] px-3 py-1.5 text-sm font-medium text-[hsl(var(--foreground))] transition-all hover:bg-[hsl(var(--secondary))] disabled:opacity-40"
          >
            上一页
          </button>
          <span className="px-3 text-sm text-[hsl(var(--muted-foreground))]">
            {pagination.page} / {pagination.totalPages}
          </span>
          <button
            type="button"
            disabled={pagination.page >= pagination.totalPages}
            onClick={() => handlePage(pagination.page + 1)}
            className="rounded-lg border border-[hsl(var(--border))] px-3 py-1.5 text-sm font-medium text-[hsl(var(--foreground))] transition-all hover:bg-[hsl(var(--secondary))] disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      )}

      {/* ─── Batch Action Bar ────────────────────────── */}
      {selected.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3 shadow-lg md:bottom-0">
          <div className="mx-auto flex max-w-4xl items-center justify-between">
            <span className="text-sm text-[hsl(var(--foreground))]">
              已选择 <span className="font-bold text-brand-blue">{selected.size}</span> 项
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="rounded-lg border border-[hsl(var(--border))] px-3 py-1.5 text-sm font-medium text-[hsl(var(--muted-foreground))] transition-all hover:bg-[hsl(var(--secondary))]"
              >
                取消选择
              </button>
              <button
                type="button"
                onClick={() => setShowPurgeConfirm(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-1.5 text-sm font-semibold text-white transition-all hover:bg-red-500"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
                批量清除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Purge Modal ─────────────────────────────── */}
      {showPurgeConfirm && (
        <PurgeConfirmModal
          count={selected.size}
          onClose={() => setShowPurgeConfirm(false)}
          onConfirm={handlePurge}
          submitting={purging}
        />
      )}
    </div>
  );
}
