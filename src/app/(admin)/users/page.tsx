"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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

type UserViewMode = "users" | "cooldowns";

type CooldownType = "PROFILE_EDIT" | "DATA_DELETE" | "MATCH_POOL";

interface CooldownItem {
  type: CooldownType;
  label: string;
  releaseLabel: string;
  startedAt: string;
  endsAt: string;
  remainingMs: number;
  remainingText: string;
  source: string;
}

interface CooldownUser {
  id: string;
  qqNumber: string | null;
  nickname: string | null;
  role: string;
  status: string;
  cooldowns: CooldownItem[];
}

interface CooldownReleaseTarget {
  user: CooldownUser;
  cooldown: CooldownItem;
}

/* ─── Constants ──────────────────────────────────────── */

const ROLE_LABELS: Record<string, string> = {
  USER: "用户",
  SCORER: "评分员",
  ADMIN: "管理员",
  SUPER_ADMIN: "超级管理员",
};

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: "正常", cls: "bg-[#f6ffed] text-[#389e0d] border-[#b7eb8f]" },
  BANNED: { label: "封禁", cls: "bg-[#fff1f0] text-[#cf1322] border-[#ffa39e]" },
  PENDING_DELETE: { label: "待删除", cls: "bg-[#fffbe6] text-[#d48806] border-[#ffe58f]" },
  DELETED: { label: "注销", cls: "bg-[#f5f5f5] text-[#595959] border-[#d9d9d9]" },
};

const MEMBERSHIP_LABELS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "待审核", cls: "bg-[#fffbe6] text-[#d48806] border-[#ffe58f]" },
  VERIFIED: { label: "已认证", cls: "bg-[#e6fffb] text-[#08979c] border-[#87e8de]" },
  REJECTED: { label: "已拒绝", cls: "bg-[#fff1f0] text-[#cf1322] border-[#ffa39e]" },
  REVOKED: { label: "已撤销", cls: "bg-[#fff1f0] text-[#cf1322] border-[#ffa39e]" },
};

function Badge({ label, cls }: { label: string; cls: string }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide ${cls}`}>
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

function formatDateTime(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const ROLE_BADGE_CLS: Record<string, string> = {
  USER: "bg-[#f5f5f5] text-[#595959] border-[#d9d9d9]",
  SCORER: "bg-[#fff0f6] text-[#c41d7f] border-[#ffadd2]",
  ADMIN: "bg-[#e6f4ff] text-[#0958d9] border-[#91caff]",
  SUPER_ADMIN: "bg-[#fffbe6] text-[#d48806] border-[#ffe58f]",
};

/* ─── Role Selector (Super Admin only) ──────────── */

function RoleSelector({
  user,
  onChanged,
}: {
  user: AdminUser;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const options = [
    { value: "USER", label: "用户" },
    { value: "SCORER", label: "评分员" },
    { value: "ADMIN", label: "管理员" },
  ];

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(event: MouseEvent | TouchEvent) {
      const target = event.target;
      if (target instanceof Node && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [open]);

  async function handleSelect(role: string) {
    if (role === user.role) {
      setOpen(false);
      return;
    }
    const roleLabel = options.find((o) => o.value === role)?.label || role;
    if (!confirm(`确定将 ${user.nickname || user.qqNumber || "用户"} 的角色变更为 ${roleLabel}？`)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/role`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "操作失败");
      onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : "操作失败");
    } finally {
      setLoading(false);
      setOpen(false);
    }
  }

  if (user.role === "SUPER_ADMIN") {
    return (
      <Badge
        label={ROLE_LABELS[user.role] || user.role}
        cls={ROLE_BADGE_CLS[user.role] || ""}
      />
    );
  }

  const badgeCls = ROLE_BADGE_CLS[user.role] || "";

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={loading}
        className={`inline-flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-all hover:ring-1 hover:ring-[hsl(var(--primary)/0.3)] ${badgeCls}`}
        title="点击修改角色"
      >
        {ROLE_LABELS[user.role] || user.role}
        <span className="text-[8px] opacity-60">▼</span>
      </button>
    );
  }

  return (
    <div ref={menuRef} className="relative">
      <div className="absolute left-0 top-0 z-20 min-w-[120px] rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] py-1 shadow-lg">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => handleSelect(opt.value)}
            disabled={loading}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-[hsl(var(--secondary))] ${
              opt.value === user.role
                ? "font-semibold text-[hsl(var(--primary))]"
                : "text-[hsl(var(--foreground))]"
            }`}
          >
            {opt.label}
            {opt.value === user.role && <span className="ml-auto text-[10px]">✓</span>}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="mt-1 flex w-full items-center justify-center border-t border-[hsl(var(--border))] px-3 py-1.5 text-[10px] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
        >
          取消
        </button>
      </div>
    </div>
  );
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
    { value: "warn", label: "⚠️ 警告", show: user.status !== "BANNED" && user.status !== "PENDING_DELETE" },
    {
      value: "ban",
      label: "🚫 封禁",
      show: user.status !== "BANNED" && user.status !== "PENDING_DELETE",
    },
    {
      value: "revoke_warn",
      label: "↩️ 撤销警告",
      show: user.penaltyCount > 0 && user.status !== "BANNED" && user.status !== "PENDING_DELETE",
    },
    {
      value: "revoke_ban",
      label: "↩️ 撤销封禁",
      show: user.status === "BANNED",
    },
    {
      value: "approve_delete",
      label: "✓ 批准删除",
      show: user.status === "PENDING_DELETE",
    },
    {
      value: "cancel_delete",
      label: "↩️ 撤销删除",
      show: user.status === "PENDING_DELETE",
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
            className="flex-1 rounded-lg bg-brand-blue py-2 text-sm font-semibold text-white transition-all hover:scale-[1.02] hover:bg-brand-blue/90 active:scale-[0.98] disabled:opacity-50"
          >
            {submitting ? "处理中..." : "确认执行"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Delete Confirm Modal ───────────────────────────── */

function DeleteConfirmModal({
  user,
  onClose,
  onSuccess,
}: {
  user: AdminUser;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const confirmText = user.qqNumber || user.id;

  async function handleDelete() {
    if (confirmation !== confirmText) {
      return setErr(`请输入「${confirmText}」以确认删除`);
    }
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "删除失败");
      onSuccess();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "删除失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-red-500/30 bg-[hsl(var(--card))] p-6 shadow-2xl">
        <h3 className="mb-1 text-base font-bold text-red-400">
          ⚠️ 删除用户
        </h3>
        <p className="mb-4 text-xs text-[hsl(var(--muted-foreground))]">
          即将删除用户 <span className="font-bold text-[hsl(var(--foreground))]">{user.nickname || user.qqNumber}</span>，此操作不可逆！所有相关数据将被永久删除。
        </p>

        <div className="mb-3">
          <label className="mb-1.5 block text-xs text-[hsl(var(--muted-foreground))]">
            请输入该用户的QQ号 <span className="font-mono font-bold text-[hsl(var(--foreground))]">{confirmText}</span> 以确认
          </label>
          <input
            type="text"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder={confirmText}
            className="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-3 py-2.5 text-sm text-[hsl(var(--foreground))] outline-none focus:border-red-500/50 transition-colors"
          />
        </div>

        {err && (
          <p className="mb-3 text-xs text-red-400">{err}</p>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-[hsl(var(--border))] py-2.5 text-sm font-medium text-[hsl(var(--muted-foreground))] transition-all hover:bg-[hsl(var(--secondary))]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={submitting || confirmation !== confirmText}
            className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white transition-all hover:bg-red-500 disabled:opacity-40"
          >
            {submitting ? "删除中..." : "确认删除"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────── */

function BatchDeleteConfirmModal({
  users,
  onClose,
  onSuccess,
}: {
  users: AdminUser[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const confirmText = "确认批量删除";
  const previewUsers = users.slice(0, 6);

  async function handleDelete() {
    if (confirmation !== confirmText) {
      return setErr(`请输入「${confirmText}」以确认批量删除`);
    }
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/users/batch-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: users.map((user) => user.id) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "批量删除失败");
      onSuccess();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "批量删除失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-red-500/30 bg-[hsl(var(--card))] p-6 shadow-2xl">
        <h3 className="mb-1 text-base font-bold text-red-400">
          批量删除用户
        </h3>
        <p className="mb-4 text-xs leading-5 text-[hsl(var(--muted-foreground))]">
          即将永久删除 {users.length} 个用户，相关资料、匹配、举报、处罚记录和照片文件都会被清理。此操作不可逆。
        </p>

        <div className="mb-4 max-h-32 overflow-y-auto rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.55)] p-3">
          <div className="space-y-1">
            {previewUsers.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between gap-3 text-xs"
              >
                <span className="truncate text-[hsl(var(--foreground))]">
                  {user.nickname || user.qqNumber || user.id}
                </span>
                <span className="font-mono text-[10px] text-[hsl(var(--muted-foreground))]">
                  {user.qqNumber || user.id.slice(0, 8)}
                </span>
              </div>
            ))}
            {users.length > previewUsers.length && (
              <div className="text-xs text-[hsl(var(--muted-foreground))]">
                另有 {users.length - previewUsers.length} 个用户
              </div>
            )}
          </div>
        </div>

        <div className="mb-3">
          <label className="mb-1.5 block text-xs text-[hsl(var(--muted-foreground))]">
            请输入 <span className="font-mono font-bold text-[hsl(var(--foreground))]">{confirmText}</span> 以确认
          </label>
          <input
            type="text"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder={confirmText}
            className="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-3 py-2.5 text-sm text-[hsl(var(--foreground))] outline-none transition-colors focus:border-red-500/50"
          />
        </div>

        {err && (
          <p className="mb-3 text-xs text-red-400">{err}</p>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-[hsl(var(--border))] py-2.5 text-sm font-medium text-[hsl(var(--muted-foreground))] transition-all hover:bg-[hsl(var(--secondary))]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={submitting || confirmation !== confirmText}
            className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white transition-all hover:bg-red-500 disabled:opacity-40"
          >
            {submitting ? "删除中..." : "确认批量删除"}
          </button>
        </div>
      </div>
    </div>
  );
}

const COOLDOWN_SOURCE_LABELS: Record<string, string> = {
  PROFILE_SUBMIT: "发布资料",
  PHOTO_REVOKE: "照片撤销",
  PROFILE_CLEAR: "清空资料",
  ACCOUNT_DELETE: "注销等待期",
  MATCH_PREF: "匹配池调整",
};

function CooldownReleaseModal({
  target,
  onClose,
  onSuccess,
}: {
  target: CooldownReleaseTarget;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [confirmation, setConfirmation] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const confirmText = "确认解除冷却";
  const displayName = target.user.nickname || target.user.qqNumber || target.user.id;
  const canSubmit = confirmation === confirmText && reason.trim().length > 0;

  async function handleSubmit() {
    if (!canSubmit) return;

    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/users/${target.user.id}/cooldown`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: target.cooldown.type,
          confirmation,
          reason: reason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "解除冷却失败");
      onSuccess();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "解除冷却失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-red-500/30 bg-[hsl(var(--card))] p-6 shadow-2xl">
        <h3 className="mb-2 text-base font-bold text-red-400">
          解除冷却确认
        </h3>
        <p className="mb-4 text-sm leading-6 text-[hsl(var(--muted-foreground))]">
          你正在解除用户
          <span className="font-semibold text-[hsl(var(--foreground))]">【{displayName}】</span>
          的
          <span className="font-semibold text-[hsl(var(--foreground))]">【{target.cooldown.label}】</span>
          ，解除后该用户将可以立即再次进行该操作。请确认是否继续。
        </p>

        <div className="mb-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.5)] p-3 text-xs leading-5">
          <div className="flex justify-between gap-3">
            <span className="text-[hsl(var(--muted-foreground))]">开始时间</span>
            <span className="text-right text-[hsl(var(--foreground))]">{formatDateTime(target.cooldown.startedAt)}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-[hsl(var(--muted-foreground))]">结束时间</span>
            <span className="text-right text-[hsl(var(--foreground))]">{formatDateTime(target.cooldown.endsAt)}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-[hsl(var(--muted-foreground))]">剩余时间</span>
            <span className="text-right font-semibold text-red-400">{target.cooldown.remainingText}</span>
          </div>
        </div>

        <div className="mb-3">
          <label className="mb-1.5 block text-xs text-[hsl(var(--muted-foreground))]">
            请输入 <span className="font-mono font-bold text-[hsl(var(--foreground))]">{confirmText}</span> 以确认
          </label>
          <input
            type="text"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder={confirmText}
            className="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-3 py-2.5 text-sm text-[hsl(var(--foreground))] outline-none transition-colors focus:border-red-500/50"
          />
        </div>

        <div className="mb-3">
          <label className="mb-1.5 block text-xs text-[hsl(var(--muted-foreground))]">操作原因 / 备注</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="请填写解除原因或备注..."
            className="w-full resize-none rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-3 py-2.5 text-sm text-[hsl(var(--foreground))] outline-none transition-colors focus:border-red-500/50"
          />
        </div>

        {err && (
          <p className="mb-3 text-xs text-red-400">{err}</p>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-[hsl(var(--border))] py-2.5 text-sm font-medium text-[hsl(var(--muted-foreground))] transition-all hover:bg-[hsl(var(--secondary))]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !canSubmit}
            className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white transition-all hover:bg-red-500 disabled:opacity-40"
          >
            {submitting ? "解除中..." : "确认解除"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CooldownManagementList({
  users,
  loading,
  error,
  isSuperAdmin,
  onRefresh,
  onRelease,
}: {
  users: CooldownUser[];
  loading: boolean;
  error: string | null;
  isSuperAdmin: boolean;
  onRefresh: () => void;
  onRelease: (target: CooldownReleaseTarget) => void;
}) {
  if (error) {
    return (
      <div className="rounded-lg border border-[hsl(0,62%,50%/0.3)] bg-[hsl(0,62%,50%/0.1)] px-4 py-3 text-sm text-[hsl(0,62%,70%)]">
        {error}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[hsl(var(--primary))] border-t-transparent" />
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] py-16">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-brand-muted mb-3 [&_svg]:h-6 [&_svg]:w-6 [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-2 [&_svg]:stroke-linecap-round [&_svg]:stroke-linejoin-round">
          <svg viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
        </span>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">当前没有存在冷却限制的用户</p>
        <button
          type="button"
          onClick={onRefresh}
          className="mt-3 rounded-lg border border-[hsl(var(--border))] px-3 py-1.5 text-xs font-medium text-[hsl(var(--foreground))] transition-all hover:bg-[hsl(var(--secondary))]"
        >
          刷新
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!isSuperAdmin && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-500">
          当前账号可查看冷却状态，解除冷却需超级管理员权限。
        </div>
      )}

      {users.map((user) => {
        const statusInfo = STATUS_LABELS[user.status] || { label: user.status, cls: "" };

        return (
          <section
            key={user.id}
            className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]"
          >
            <div className="flex flex-wrap items-center gap-3 border-b border-[hsl(var(--border))] px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-[hsl(var(--foreground))]">
                    {user.nickname || user.qqNumber || user.id}
                  </span>
                  <Badge label={ROLE_LABELS[user.role] || user.role} cls={ROLE_BADGE_CLS[user.role] || ""} />
                  <Badge label={statusInfo.label} cls={statusInfo.cls} />
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[hsl(var(--muted-foreground))]">
                  <span>ID: <span className="font-mono">{user.id}</span></span>
                  <span>QQ: {user.qqNumber || "—"}</span>
                </div>
              </div>
              <span className="rounded-full bg-[hsl(var(--secondary))] px-2.5 py-1 text-xs text-[hsl(var(--muted-foreground))]">
                {user.cooldowns.length} 项冷却
              </span>
            </div>

            <div className="divide-y divide-[hsl(var(--border)/0.6)]">
              {user.cooldowns.map((cooldown) => (
                <div
                  key={`${user.id}-${cooldown.type}`}
                  className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(160px,1fr)_minmax(420px,2fr)_auto] lg:items-center"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-[hsl(var(--foreground))]">{cooldown.label}</span>
                      <span className="rounded-full border border-[hsl(var(--border))] px-2 py-0.5 text-[10px] text-[hsl(var(--muted-foreground))]">
                        {COOLDOWN_SOURCE_LABELS[cooldown.source] || cooldown.source}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-semibold text-red-400">剩余 {cooldown.remainingText}</p>
                  </div>

                  <div className="grid gap-2 text-xs text-[hsl(var(--muted-foreground))] sm:grid-cols-2">
                    <div>
                      <span>开始时间：</span>
                      <span className="text-[hsl(var(--foreground))]">{formatDateTime(cooldown.startedAt)}</span>
                    </div>
                    <div>
                      <span>结束时间：</span>
                      <span className="text-[hsl(var(--foreground))]">{formatDateTime(cooldown.endsAt)}</span>
                    </div>
                  </div>

                  {isSuperAdmin && (
                    <button
                      type="button"
                      onClick={() => onRelease({ user, cooldown })}
                      className="w-full rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-400 transition-all hover:bg-red-500/20 lg:w-auto"
                    >
                      {cooldown.releaseLabel}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export default function AdminUsersPage() {
  const [viewMode, setViewMode] = useState<UserViewMode>("users");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cooldownUsers, setCooldownUsers] = useState<CooldownUser[]>([]);
  const [cooldownLoading, setCooldownLoading] = useState(false);
  const [cooldownError, setCooldownError] = useState<string | null>(null);
  const [cooldownTotal, setCooldownTotal] = useState(0);
  const [cooldownSearch, setCooldownSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [actionTarget, setActionTarget] = useState<AdminUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [cooldownReleaseTarget, setCooldownReleaseTarget] =
    useState<CooldownReleaseTarget | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const pageSize = 20;

  // Check role on mount
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.data?.role === "SUPER_ADMIN") setIsSuperAdmin(true);
        if (data?.data?.id) setCurrentUserId(data.data.id);
      })
      .catch(() => {});
  }, []);

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
      const nextUsers: AdminUser[] = data.data || [];
      setUsers(nextUsers);
      setSelectedIds((prev) =>
        prev.filter((id) => nextUsers.some((user) => user.id === id)),
      );
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
    if (viewMode !== "users") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Fetch table data when filters or pagination change.
    fetchUsers();
  }, [fetchUsers, viewMode]);

  const fetchCooldownUsers = useCallback(async () => {
    setCooldownLoading(true);
    setCooldownError(null);
    try {
      const params = new URLSearchParams();
      if (cooldownSearch.trim()) params.set("search", cooldownSearch.trim());
      const query = params.toString();
      const res = await fetch(`/api/admin/users/cooldowns${query ? `?${query}` : ""}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "加载冷却列表失败");

      const nextUsers: CooldownUser[] = data.data?.users || [];
      setCooldownUsers(nextUsers);
      setCooldownTotal(data.data?.total || nextUsers.length);
    } catch (err) {
      setCooldownError(err instanceof Error ? err.message : "加载冷却列表失败");
    } finally {
      setCooldownLoading(false);
    }
  }, [cooldownSearch]);

  useEffect(() => {
    if (viewMode !== "cooldowns") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Fetch cooldown data when entering the cooldown management view.
    fetchCooldownUsers();
  }, [fetchCooldownUsers, viewMode]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    fetchUsers();
  }

  function handleCooldownSearch(e: React.FormEvent) {
    e.preventDefault();
    fetchCooldownUsers();
  }

  const selectedIdSet = new Set(selectedIds);
  const selectedUsers = users.filter((user) => selectedIdSet.has(user.id));
  const selectableUserIds = users
    .filter((user) => currentUserId !== null && user.id !== currentUserId)
    .map((user) => user.id);
  const allCurrentPageSelected =
    selectableUserIds.length > 0 &&
    selectableUserIds.every((id) => selectedIdSet.has(id));

  function toggleUserSelection(userId: string) {
    setSelectedIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId],
    );
  }

  function toggleCurrentPageSelection() {
    setSelectedIds((prev) => {
      if (allCurrentPageSelected) {
        return prev.filter((id) => !selectableUserIds.includes(id));
      }
      return [...new Set([...prev, ...selectableUserIds])];
    });
  }

  const SELECT_CLS =
    "rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-3 py-2 text-sm text-[hsl(var(--foreground))] outline-none focus:border-[hsl(var(--primary))]";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">
          用户管理
        </h1>
        <div className="inline-flex rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-1">
          <button
            type="button"
            onClick={() => setViewMode("users")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
              viewMode === "users"
                ? "bg-[hsl(var(--primary))] text-white"
                : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            }`}
          >
            用户列表
          </button>
          <button
            type="button"
            onClick={() => setViewMode("cooldowns")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
              viewMode === "cooldowns"
                ? "bg-[hsl(var(--primary))] text-white"
                : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            }`}
          >
            冷却时间管理
          </button>
        </div>
      </div>

      {/* Search & Filters */}
      {viewMode === "users" && (
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
          <option value="BANNED">封禁</option>
          <option value="PENDING_DELETE">待删除</option>
        </select>

        <div className="ml-auto flex items-center gap-3">
          {isSuperAdmin && selectedIds.length > 0 && (
            <button
              type="button"
              onClick={() => setBatchDeleteOpen(true)}
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-400 transition-all hover:bg-red-500/20"
            >
              批量删除 ({selectedIds.length})
            </button>
          )}
          <span className="text-xs text-[hsl(var(--muted-foreground))]">
            共 {total} 个用户
          </span>
        </div>
      </div>
      )}

      {viewMode === "cooldowns" && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
          <div>
            <p className="text-sm font-semibold text-[hsl(var(--foreground))]">冷却时间管理</p>
            <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
              仅显示当前存在冷却限制的用户，每项冷却可独立解除。
            </p>
          </div>
          <div className="ml-auto flex w-full flex-col items-stretch gap-3 lg:w-auto lg:flex-row lg:items-center">
            <form onSubmit={handleCooldownSearch} className="flex gap-2">
              <input
                type="text"
                value={cooldownSearch}
                onChange={(e) => setCooldownSearch(e.target.value)}
                placeholder="搜索 QQ号 / 昵称..."
                className="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-3 py-2 text-sm text-[hsl(var(--foreground))] outline-none focus:border-[hsl(var(--primary))] sm:w-56"
              />
              <button
                type="submit"
                className="shrink-0 rounded-lg bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-white transition-all hover:scale-[1.02]"
              >
                搜索
              </button>
            </form>
            <span className="text-xs text-[hsl(var(--muted-foreground))]">
              共 {cooldownTotal} 个用户
            </span>
            <button
              type="button"
              onClick={fetchCooldownUsers}
              className="rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-xs font-medium text-[hsl(var(--foreground))] transition-all hover:bg-[hsl(var(--secondary))]"
            >
              刷新
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {viewMode === "users" && error && (
        <div className="rounded-lg border border-[hsl(0,62%,50%/0.3)] bg-[hsl(0,62%,50%/0.1)] px-4 py-3 text-sm text-[hsl(0,62%,70%)]">
          {error}
        </div>
      )}

      {/* Loading */}
      {viewMode === "users" && loading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[hsl(var(--primary))] border-t-transparent" />
        </div>
      )}

      {/* Table */}
      {viewMode === "users" && !loading && (
        <div className="overflow-x-auto rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] [-webkit-overflow-scrolling:touch]">
          <table className="min-w-[1180px] table-fixed border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[hsl(var(--border))] text-left text-xs text-[hsl(var(--muted-foreground))]">
                {isSuperAdmin && (
                  <th className="w-[54px] px-4 py-3 font-medium whitespace-nowrap">
                    <input
                      type="checkbox"
                      aria-label="选择当前页用户"
                      checked={allCurrentPageSelected}
                      disabled={selectableUserIds.length === 0}
                      onChange={toggleCurrentPageSelection}
                      className="h-4 w-4 rounded border-[hsl(var(--border))] accent-red-500 disabled:opacity-40"
                    />
                  </th>
                )}
                <th className="w-[130px] px-4 py-3 font-medium whitespace-nowrap">QQ号</th>
                <th className="w-[150px] px-4 py-3 font-medium whitespace-nowrap">昵称</th>
                <th className="w-[150px] px-4 py-3 font-medium whitespace-nowrap">角色</th>
                <th className="w-[110px] px-4 py-3 font-medium whitespace-nowrap">状态</th>
                <th className="w-[130px] px-4 py-3 font-medium whitespace-nowrap">群认证</th>
                <th className="w-[120px] px-4 py-3 font-medium whitespace-nowrap">资料</th>
                <th className="w-[80px] px-4 py-3 font-medium whitespace-nowrap">处罚</th>
                <th className="w-[150px] px-4 py-3 font-medium whitespace-nowrap">注册时间</th>
                <th className="w-[200px] px-4 py-3 font-medium whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const statusInfo = STATUS_LABELS[user.status] || { label: user.status, cls: "" };
                const memberInfo = user.membershipStatus
                  ? MEMBERSHIP_LABELS[user.membershipStatus] || { label: user.membershipStatus, cls: "" }
                  : null;
                const canSelectUser = currentUserId !== null && user.id !== currentUserId;
                const isSelected = selectedIdSet.has(user.id);

                return (
                  <tr
                    key={user.id}
                    className="border-b border-[hsl(var(--border)/0.5)] transition-colors hover:bg-[hsl(var(--secondary)/0.5)]"
                  >
                    {isSuperAdmin && (
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label={`选择 ${user.nickname || user.qqNumber || user.id}`}
                          checked={isSelected}
                          disabled={!canSelectUser}
                          onChange={() => toggleUserSelection(user.id)}
                          className="h-4 w-4 rounded border-[hsl(var(--border))] accent-red-500 disabled:opacity-40"
                        />
                      </td>
                    )}
                    <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{user.qqNumber || "—"}</td>
                    <td className="px-4 py-3">
                      <span className="block truncate">{user.nickname || "—"}</span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {isSuperAdmin ? (
                        <RoleSelector user={user} onChanged={fetchUsers} />
                      ) : (
                        <Badge
                          label={ROLE_LABELS[user.role] || user.role}
                          cls={ROLE_BADGE_CLS[user.role] || ""}
                        />
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Badge label={statusInfo.label} cls={statusInfo.cls} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {memberInfo ? (
                        <Badge label={memberInfo.label} cls={memberInfo.cls} />
                      ) : (
                        <span className="text-xs text-[hsl(var(--muted-foreground))]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
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
                    <td className="px-4 py-3 text-xs whitespace-nowrap text-[hsl(var(--muted-foreground))]">
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-nowrap gap-1.5">
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
                        {isSuperAdmin && user.id !== currentUserId && (
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(user)}
                            className="rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-400 transition-all hover:bg-red-500/20"
                          >
                            删除
                          </button>
                        )}
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
      {viewMode === "users" && !loading && users.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] py-16">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-brand-muted mb-3 [&_svg]:h-6 [&_svg]:w-6 [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-2 [&_svg]:stroke-linecap-round [&_svg]:stroke-linejoin-round">
            <svg viewBox="0 0 24 24">
              <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </span>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">未找到匹配的用户</p>
        </div>
      )}

      {/* Pagination */}
      {viewMode === "users" && totalPages > 1 && (
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

      {viewMode === "cooldowns" && (
        <CooldownManagementList
          users={cooldownUsers}
          loading={cooldownLoading}
          error={cooldownError}
          isSuperAdmin={isSuperAdmin}
          onRefresh={fetchCooldownUsers}
          onRelease={setCooldownReleaseTarget}
        />
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

      {/* Delete Confirm Modal */}
      {deleteTarget && (
        <DeleteConfirmModal
          user={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onSuccess={() => {
            setDeleteTarget(null);
            fetchUsers();
          }}
        />
      )}

      {/* Batch Delete Confirm Modal */}
      {batchDeleteOpen && selectedUsers.length > 0 && (
        <BatchDeleteConfirmModal
          users={selectedUsers}
          onClose={() => setBatchDeleteOpen(false)}
          onSuccess={() => {
            setBatchDeleteOpen(false);
            setSelectedIds([]);
            fetchUsers();
          }}
        />
      )}

      {/* Cooldown Release Confirm Modal */}
      {cooldownReleaseTarget && (
        <CooldownReleaseModal
          target={cooldownReleaseTarget}
          onClose={() => setCooldownReleaseTarget(null)}
          onSuccess={() => {
            setCooldownReleaseTarget(null);
            fetchCooldownUsers();
            fetchUsers();
          }}
        />
      )}
    </div>
  );
}
