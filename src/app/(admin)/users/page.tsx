"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

/* ─── Types ──────────────────────────────────────────── */

interface AdminUser {
  id: string;
  qqNumber: string | null;
  nickname: string | null;
  role: string;
  status: string;
  membershipStatus: string | null;
  hasProfile: boolean;
  penaltyCount: number;
  createdAt: string;
  lastLoginAt: string | null;
}

/* ─── Constants ──────────────────────────────────────── */

const ROLE_LABELS: Record<string, string> = {
  USER: "用户",
  SCORER: "评分员",
  ADMIN: "管理员",
  SUPER_ADMIN: "超级管理员",
};

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: "正常", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  FROZEN: { label: "冻结", cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  BANNED: { label: "封禁", cls: "bg-red-500/15 text-red-400 border-red-500/30" },
  DELETED: { label: "注销", cls: "bg-gray-500/15 text-gray-400 border-gray-500/30" },
};

const MEMBERSHIP_LABELS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "待审核", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  VERIFIED: { label: "已认证", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  REJECTED: { label: "已拒绝", cls: "bg-red-500/15 text-red-400 border-red-500/30" },
  EXPIRED: { label: "已过期", cls: "bg-gray-500/15 text-gray-400 border-gray-500/30" },
  REVOKED: { label: "已撤销", cls: "bg-red-500/15 text-red-400 border-red-500/30" },
};

function Badge({ label, cls }: { label: string; cls: string }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      {label}
    </span>
  );
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/* ─── Action Modal ───────────────────────────────────── */

function ActionModal({
  user,
  onClose,
  onSuccess,
}: {
  user: AdminUser;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [action, setAction] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const actions = [
    { value: "warn", label: "⚠️ 警告", show: true },
    {
      value: "freeze",
      label: "🧊 冻结",
      show: user.status === "ACTIVE",
    },
    {
      value: "unfreeze",
      label: "🔓 解冻",
      show: user.status === "FROZEN",
    },
    {
      value: "ban",
      label: "🚫 封禁",
      show: user.status !== "BANNED",
    },
    {
      value: "unban",
      label: "✅ 解封",
      show: user.status === "BANNED",
    },
  ].filter((a) => a.show);

  async function handleSubmit() {
    if (!action) return setErr("请选择操作");
    if (!reason.trim()) return setErr("请填写原因");
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: reason.trim() }),
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
          管理操作 — {user.nickname || user.qqNumber || "用户"}
        </h3>

        {/* Action select */}
        <div className="mb-4">
          <label className="mb-1.5 block text-sm text-[hsl(var(--muted-foreground))]">操作类型</label>
          <div className="flex flex-wrap gap-2">
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
        </div>

        {/* Reason */}
        <div className="mb-4">
          <label className="mb-1.5 block text-sm text-[hsl(var(--muted-foreground))]">原因</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="请填写操作原因..."
            rows={3}
            className="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-3 py-2 text-sm text-[hsl(var(--foreground))] outline-none focus:border-[hsl(var(--primary))]"
          />
        </div>

        {err && (
          <p className="mb-3 text-xs text-red-400">{err}</p>
        )}

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
            disabled={submitting}
            className="flex-1 rounded-lg bg-gradient-to-r from-[hsl(262,83%,58%)] to-[hsl(290,70%,55%)] py-2 text-sm font-semibold text-white transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
          >
            {submitting ? "处理中..." : "确认执行"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────── */

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [actionTarget, setActionTarget] = useState<AdminUser | null>(null);
  const pageSize = 20;

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search.trim()) params.set("search", search.trim());
      if (roleFilter) params.set("role", roleFilter);
      if (statusFilter) params.set("status", statusFilter);

      const res = await fetch(`/api/admin/users?${params}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || "加载失败");
      }
      const data = await res.json();
      setUsers(data.data || []);
      if (data.pagination) {
        setTotalPages(data.pagination.totalPages);
        setTotal(data.pagination.total);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [page, search, roleFilter, statusFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    fetchUsers();
  }

  const SELECT_CLS =
    "rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-3 py-2 text-sm text-[hsl(var(--foreground))] outline-none focus:border-[hsl(var(--primary))]";

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">
        👥 用户管理
      </h1>

      {/* Search & Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索 QQ号 / 昵称..."
            className="w-56 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-3 py-2 text-sm text-[hsl(var(--foreground))] outline-none focus:border-[hsl(var(--primary))]"
          />
          <button
            type="submit"
            className="rounded-lg bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-white transition-all hover:scale-[1.02]"
          >
            搜索
          </button>
        </form>

        <select
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
          className={SELECT_CLS}
        >
          <option value="">全部角色</option>
          <option value="USER">用户</option>
          <option value="SCORER">评分员</option>
          <option value="ADMIN">管理员</option>
          <option value="SUPER_ADMIN">超级管理员</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className={SELECT_CLS}
        >
          <option value="">全部状态</option>
          <option value="ACTIVE">正常</option>
          <option value="FROZEN">冻结</option>
          <option value="BANNED">封禁</option>
        </select>

        <span className="ml-auto text-xs text-[hsl(var(--muted-foreground))]">
          共 {total} 个用户
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
                <th className="px-4 py-3 font-medium">角色</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">群认证</th>
                <th className="px-4 py-3 font-medium">资料</th>
                <th className="px-4 py-3 font-medium">处罚</th>
                <th className="px-4 py-3 font-medium">注册时间</th>
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const statusInfo = STATUS_LABELS[user.status] || { label: user.status, cls: "" };
                const memberInfo = user.membershipStatus
                  ? MEMBERSHIP_LABELS[user.membershipStatus] || { label: user.membershipStatus, cls: "" }
                  : null;

                return (
                  <tr
                    key={user.id}
                    className="border-b border-[hsl(var(--border)/0.5)] transition-colors hover:bg-[hsl(var(--secondary)/0.5)]"
                  >
                    <td className="px-4 py-3 font-mono text-xs">{user.qqNumber || "—"}</td>
                    <td className="px-4 py-3">{user.nickname || "—"}</td>
                    <td className="px-4 py-3 text-xs">{ROLE_LABELS[user.role] || user.role}</td>
                    <td className="px-4 py-3">
                      <Badge label={statusInfo.label} cls={statusInfo.cls} />
                    </td>
                    <td className="px-4 py-3">
                      {memberInfo ? (
                        <Badge label={memberInfo.label} cls={memberInfo.cls} />
                      ) : (
                        <span className="text-xs text-[hsl(var(--muted-foreground))]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {user.hasProfile ? (
                        <span className="text-emerald-400 text-xs">✓ 已填写</span>
                      ) : (
                        <span className="text-xs text-[hsl(var(--muted-foreground))]">未填写</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {user.penaltyCount > 0 ? (
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-500/15 text-[10px] font-bold text-red-400">
                          {user.penaltyCount}
                        </span>
                      ) : (
                        <span className="text-xs text-[hsl(var(--muted-foreground))]">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-[hsl(var(--muted-foreground))]">
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        <Link
                          href={`/users/${user.id}`}
                          className="rounded-md bg-[hsl(var(--secondary))] px-2.5 py-1 text-[11px] font-medium text-[hsl(var(--foreground))] transition-all hover:bg-[hsl(var(--primary)/0.15)] hover:text-[hsl(var(--primary))]"
                        >
                          详情
                        </Link>
                        <button
                          type="button"
                          onClick={() => setActionTarget(user)}
                          className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-400 transition-all hover:bg-amber-500/20"
                        >
                          管理
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state */}
      {!loading && users.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] py-16">
          <div className="mb-3 text-4xl">👤</div>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">未找到匹配的用户</p>
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
        <ActionModal
          user={actionTarget}
          onClose={() => setActionTarget(null)}
          onSuccess={() => {
            setActionTarget(null);
            fetchUsers();
          }}
        />
      )}
    </div>
  );
}
