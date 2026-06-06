"use client";

import { useState, useEffect, useCallback } from "react";

/* ─── Types ──────────────────────────────────────────── */

interface MembershipItem {
  id: string;
  userId: string;
  qqNumber: string;
  groupId: string;
  status: string;
  verifiedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  remark: string | null;
  createdAt: string;
  nickname: string | null;
  userRole: string;
}

/* ─── Constants ──────────────────────────────────────── */

const STATUS_TABS = [
  { value: "", label: "全部" },
  { value: "PENDING", label: "待审核" },
  { value: "VERIFIED", label: "已认证" },
  { value: "EXPIRED", label: "已过期" },
  { value: "REVOKED", label: "已撤销" },
  { value: "REJECTED", label: "已拒绝" },
];

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  VERIFIED: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  REJECTED: "bg-red-500/15 text-red-400 border-red-500/30",
  EXPIRED: "bg-gray-500/15 text-gray-400 border-gray-500/30",
  REVOKED: "bg-red-500/15 text-red-400 border-red-500/30",
};

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/* ─── Action Modal ───────────────────────────────────── */

function MembershipActionModal({
  item,
  onClose,
  onSuccess,
}: {
  item: MembershipItem;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [action, setAction] = useState("");
  const [remark, setRemark] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const actions = [
    { value: "approve", label: "✅ 通过", show: item.status === "PENDING" || item.status === "REJECTED" },
    { value: "reject", label: "❌ 拒绝", show: item.status === "PENDING" },
    { value: "revoke", label: "🔒 撤销", show: item.status === "VERIFIED" },
  ].filter((a) => a.show);

  async function handleSubmit() {
    if (!action) return setErr("请选择操作");
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/memberships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          userId: item.userId,
          remark: remark.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "操作失败");
      onSuccess();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "操作失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-xl">
        <h3 className="mb-4 text-base font-semibold text-[hsl(var(--foreground))]">
          群认证操作 — {item.nickname || item.qqNumber}
        </h3>

        <div className="mb-3 text-xs text-[hsl(var(--muted-foreground))]">
          QQ号: {item.qqNumber} · 当前状态: {item.status}
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {actions.map((a) => (
            <button
              key={a.value}
              type="button"
              onClick={() => setAction(a.value)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                action === a.value
                  ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))]"
                  : "border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--primary)/0.3)]"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>

        {actions.length === 0 && (
          <p className="mb-4 text-xs text-[hsl(var(--muted-foreground))]">
            当前状态无可用操作
          </p>
        )}

        <div className="mb-4">
          <label className="mb-1.5 block text-sm text-[hsl(var(--muted-foreground))]">备注（可选）</label>
          <textarea
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            placeholder="操作备注..."
            rows={2}
            className="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-3 py-2 text-sm text-[hsl(var(--foreground))] outline-none focus:border-[hsl(var(--primary))]"
          />
        </div>

        {err && <p className="mb-3 text-xs text-red-400">{err}</p>}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-[hsl(var(--border))] py-2 text-sm font-medium text-[hsl(var(--muted-foreground))] transition-all hover:bg-[hsl(var(--secondary))]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !action}
            className="flex-1 rounded-lg bg-gradient-to-r from-[hsl(262,83%,58%)] to-[hsl(290,70%,55%)] py-2 text-sm font-semibold text-white transition-all hover:scale-[1.02] disabled:opacity-50"
          >
            {submitting ? "处理中..." : "确认"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────── */

export default function MembershipsPage() {
  const [memberships, setMemberships] = useState<MembershipItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [actionTarget, setActionTarget] = useState<MembershipItem | null>(null);
  const pageSize = 20;

  const fetchMemberships = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (statusFilter) params.set("status", statusFilter);
      if (search.trim()) params.set("search", search.trim());

      const res = await fetch(`/api/admin/memberships?${params}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || "加载失败");
      }
      const data = await res.json();
      setMemberships(data.data || []);
      if (data.pagination) {
        setTotalPages(data.pagination.totalPages);
        setTotal(data.pagination.total);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, search]);

  useEffect(() => {
    fetchMemberships();
  }, [fetchMemberships]);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">✅ 群认证管理</h1>

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

      {/* Search */}
      <div className="flex items-center gap-3">
        <form
          onSubmit={(e) => { e.preventDefault(); setPage(1); fetchMemberships(); }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索 QQ号..."
            className="w-48 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-3 py-2 text-sm text-[hsl(var(--foreground))] outline-none focus:border-[hsl(var(--primary))]"
          />
          <button
            type="submit"
            className="rounded-lg bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-white transition-all hover:scale-[1.02]"
          >
            搜索
          </button>
        </form>
        <span className="ml-auto text-xs text-[hsl(var(--muted-foreground))]">
          共 {total} 条记录
        </span>
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

      {/* Table */}
      {!loading && (
        <div className="overflow-x-auto rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[hsl(var(--border))] text-left text-xs text-[hsl(var(--muted-foreground))]">
                <th className="px-4 py-3 font-medium">QQ号</th>
                <th className="px-4 py-3 font-medium">昵称</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">认证时间</th>
                <th className="px-4 py-3 font-medium">到期时间</th>
                <th className="px-4 py-3 font-medium">备注</th>
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {memberships.map((m) => {
                const statusCls = STATUS_COLORS[m.status] || "";
                return (
                  <tr
                    key={m.id}
                    className="border-b border-[hsl(var(--border)/0.5)] transition-colors hover:bg-[hsl(var(--secondary)/0.5)]"
                  >
                    <td className="px-4 py-3 font-mono text-xs">{m.qqNumber}</td>
                    <td className="px-4 py-3">{m.nickname || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusCls}`}>
                        {m.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-[hsl(var(--muted-foreground))]">
                      {formatDate(m.verifiedAt)}
                    </td>
                    <td className="px-4 py-3 text-xs text-[hsl(var(--muted-foreground))]">
                      {formatDate(m.expiresAt)}
                    </td>
                    <td className="max-w-[150px] truncate px-4 py-3 text-xs text-[hsl(var(--muted-foreground))]">
                      {m.remark || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setActionTarget(m)}
                        className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-400 transition-all hover:bg-amber-500/20"
                      >
                        管理
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty */}
      {!loading && memberships.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] py-16">
          <div className="mb-3 text-4xl">📋</div>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">暂无认证记录</p>
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

      {/* Action Modal */}
      {actionTarget && (
        <MembershipActionModal
          item={actionTarget}
          onClose={() => setActionTarget(null)}
          onSuccess={() => {
            setActionTarget(null);
            fetchMemberships();
          }}
        />
      )}
    </div>
  );
}
