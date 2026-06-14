"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/* ─── Types ──────────────────────────────────────────── */

interface PenaltyInfo {
  id: string;
  type: string;
  reason: string;
  createdAt: string;
}

interface MeData {
  id: string;
  role: string;
  status: string;
  qqNumber: string | null;
  nickname: string | null;
  avatarUrl: string | null;
  membershipStatus: string | null;
  membershipExpiresAt: string | null;
  activePenalties: PenaltyInfo[];
}

/* ─── Constants ──────────────────────────────────────── */

const ROLE_LABELS: Record<string, string> = {
  USER: "普通用户",
  SCORER: "评分员",
  ADMIN: "管理员",
  SUPER_ADMIN: "超级管理员",
};

const STATUS_INFO: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: "正常", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  BANNED: { label: "已封禁", cls: "bg-red-500/15 text-red-400 border-red-500/30" },
};

const MEMBERSHIP_INFO: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "待审核", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  VERIFIED: { label: "已认证", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  REJECTED: { label: "已拒绝", cls: "bg-red-500/15 text-red-400 border-red-500/30" },
  EXPIRED: { label: "已过期", cls: "bg-gray-500/15 text-gray-400 border-gray-500/30" },
  REVOKED: { label: "已撤销", cls: "bg-red-500/15 text-red-400 border-red-500/30" },
};

/* ─── Info Row ───────────────────────────────────────── */

function InfoRow({ icon, label, value, badge }: {
  icon: React.ReactNode;
  label: string;
  value?: React.ReactNode;
  badge?: { label: string; cls: string };
}) {
  return (
    <div className="flex items-center gap-3 border-b border-[hsl(var(--border)/0.3)] px-1 py-2.5 last:border-b-0">
      <span className="shrink-0 flex items-center justify-center">{icon}</span>
      <span className="w-24 shrink-0 text-sm text-[hsl(var(--muted-foreground))]">{label}</span>
      {badge ? (
        <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${badge.cls}`}>
          {badge.label}
        </span>
      ) : (
        <span className="text-sm font-medium text-[hsl(var(--foreground))]">{value || "—"}</span>
      )}
    </div>
  );
}

/* ─── Change Passcode Modal ──────────────────────────── */

function ChangePasscodeModal({ onClose }: { onClose: () => void }) {
  const [currentPasscode, setCurrentPasscode] = useState("");
  const [newPasscode, setNewPasscode] = useState("");
  const [confirmPasscode, setConfirmPasscode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!currentPasscode) return setMsg({ text: "请输入当前密码", ok: false });
    if (newPasscode.length < 6) return setMsg({ text: "新密码至少6位", ok: false });
    if (newPasscode !== confirmPasscode) return setMsg({ text: "两次密码不一致", ok: false });

    setSubmitting(true);
    setMsg(null);
    try {
      // Verify current passcode via login check
      const meRes = await fetch("/api/auth/me");
      const meData = await meRes.json();
      const qqNumber = meData.data?.qqNumber;
      if (!qqNumber) throw new Error("无法获取QQ号");

      // Use reset-passcode flow: we'll do a direct password change
      // Since there's no dedicated change-passcode API, we verify by re-logging in
      const loginRes = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qqNumber, passcode: currentPasscode }),
      });
      if (!loginRes.ok) throw new Error("当前密码错误");

      // Now set the new passcode
      const setRes = await fetch("/api/auth/set-passcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qqNumber, passcode: newPasscode }),
      });
      const setData = await setRes.json();
      if (!setRes.ok) throw new Error(setData.error?.message || "修改失败");

      setMsg({ text: "密码修改成功", ok: true });
      setTimeout(onClose, 1500);
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : "修改失败", ok: false });
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-3 py-2.5 text-sm text-[hsl(var(--foreground))] outline-none focus:border-[hsl(var(--primary))] transition-colors";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-xl"
      >
        <h3 className="mb-5 flex items-center gap-1.5 text-base font-semibold text-[hsl(var(--foreground))]">
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round text-brand-blue">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          修改密码
        </h3>

        <div className="mb-3">
          <label className="mb-1.5 block text-sm text-[hsl(var(--muted-foreground))]">当前密码</label>
          <input
            type="password"
            value={currentPasscode}
            onChange={(e) => setCurrentPasscode(e.target.value)}
            className={inputCls}
            autoComplete="current-password"
          />
        </div>

        <div className="mb-3">
          <label className="mb-1.5 block text-sm text-[hsl(var(--muted-foreground))]">新密码</label>
          <input
            type="password"
            value={newPasscode}
            onChange={(e) => setNewPasscode(e.target.value)}
            placeholder="至少6位"
            className={inputCls}
            autoComplete="new-password"
          />
        </div>

        <div className="mb-5">
          <label className="mb-1.5 block text-sm text-[hsl(var(--muted-foreground))]">确认新密码</label>
          <input
            type="password"
            value={confirmPasscode}
            onChange={(e) => setConfirmPasscode(e.target.value)}
            className={inputCls}
            autoComplete="new-password"
          />
        </div>

        {msg && (
          <p className={`mb-3 text-xs ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>
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
            type="submit"
            disabled={submitting}
            className="flex-1 rounded-lg bg-gradient-to-r from-[#1677ff] to-[#0958d9] py-2.5 text-sm font-semibold text-white transition-all hover:scale-[1.02] disabled:opacity-50"
          >
            {submitting ? "修改中..." : "确认修改"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ─── Delete Account Modal ───────────────────────────── */

/* ─── Change Nickname Modal ──────────────────────────── */

function ChangeNicknameModal({
  currentNickname,
  onClose,
  onSuccess,
}: {
  currentNickname: string;
  onClose: () => void;
  onSuccess: (newNickname: string) => void;
}) {
  const [nickname, setNickname] = useState(currentNickname);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = nickname.trim();
    if (!trimmed) return setMsg({ text: "请输入昵称", ok: false });
    if (trimmed.length > 30) return setMsg({ text: "昵称不能超过30个字符", ok: false });
    if (trimmed === currentNickname) return setMsg({ text: "昵称未变更", ok: false });

    setSubmitting(true);
    setMsg(null);
    try {
      const res = await fetch("/api/account/nickname", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "操作失败");
      setMsg({ text: data.data.message, ok: true });
      setTimeout(() => onSuccess(trimmed), 800);
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : "操作失败", ok: false });
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-3 py-2.5 text-sm text-[hsl(var(--foreground))] outline-none focus:border-[hsl(var(--ring))] transition-colors";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-xl"
      >
        <h3 className="mb-5 flex items-center gap-1.5 text-base font-semibold text-[hsl(var(--foreground))]">
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round text-brand-blue">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          修改昵称
        </h3>

        <div className="mb-3">
          <label className="mb-1.5 block text-sm text-[hsl(var(--muted-foreground))]">新昵称</label>
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={30}
            autoFocus
            className={inputCls}
          />
          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
            修改后将同步更新 QQ 群名片
          </p>
        </div>

        {msg && (
          <p className={`mb-3 text-xs ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>
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
            type="submit"
            disabled={submitting}
            className="flex-1 rounded-lg bg-brand-blue py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-blue/90 disabled:opacity-50"
          >
            {submitting ? "保存中..." : "保存"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ─── Delete Account Modal ───────────────────────────── */

function DeleteAccountModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const CONFIRM_TEXT = "确认删除账号";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (confirmation !== CONFIRM_TEXT) {
      return setMsg({ text: `请输入「${CONFIRM_TEXT}」以确认`, ok: false });
    }

    setSubmitting(true);
    setMsg(null);
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "操作失败");
      setMsg({ text: "账号删除请求已提交，即将退出登录", ok: true });
      setTimeout(onSuccess, 1500);
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : "操作失败", ok: false });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-[hsl(0,60%,40%/0.3)] bg-[hsl(var(--card))] p-6 shadow-xl"
      >
        <h3 className="mb-2 flex items-center gap-1.5 text-base font-semibold text-[hsl(0,60%,65%)]">
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          删除账号
        </h3>
        <p className="mb-4 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
          此操作将<strong className="text-[hsl(0,60%,65%)]">永久删除</strong>您的账号及所有数据。
          删除请求提交后您将<strong>无法再登录</strong>，管理员审核通过后数据将被彻底清除。
        </p>

        <div className="mb-4">
          <label className="mb-1.5 block text-sm text-[hsl(var(--muted-foreground))]">
            请输入「<span className="font-medium text-[hsl(var(--foreground))]">{CONFIRM_TEXT}</span>」以确认
          </label>
          <input
            type="text"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder={CONFIRM_TEXT}
            className="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-3 py-2.5 text-sm text-[hsl(var(--foreground))] outline-none focus:border-[hsl(0,60%,50%)] transition-colors"
          />
        </div>

        {msg && (
          <p className={`mb-3 text-xs ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>
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
            type="submit"
            disabled={submitting || confirmation !== CONFIRM_TEXT}
            className="flex-1 rounded-lg bg-[hsl(0,60%,45%)] py-2.5 text-sm font-semibold text-white transition-all hover:bg-[hsl(0,60%,50%)] disabled:opacity-40"
          >
            {submitting ? "提交中..." : "确认删除"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────── */

export default function MePage() {
  const router = useRouter();
  const [me, setMe] = useState<MeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showChangePasscode, setShowChangePasscode] = useState(false);
  const [showChangeNickname, setShowChangeNickname] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    async function fetchMe() {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) {
          router.push("/login");
          return;
        }
        const data = await res.json();
        setMe(data.data);
      } catch {
        router.push("/login");
      } finally {
        setLoading(false);
      }
    }
    fetchMe();
  }, [router]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
    } catch {
      setLoggingOut(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[hsl(var(--primary))] border-t-transparent" />
      </div>
    );
  }

  if (!me) return null;

  const statusInfo = STATUS_INFO[me.status];
  const memberInfo = me.membershipStatus ? MEMBERSHIP_INFO[me.membershipStatus] : null;

  const isAdmin = me.role === "ADMIN" || me.role === "SUPER_ADMIN";
  const isScorer = me.role === "SCORER" || isAdmin;

  return (
    <div className="mx-auto max-w-lg space-y-5">
      {/* Warning / Ban Notices */}
      {me.activePenalties && me.activePenalties.length > 0 && (
        <div className="space-y-3">
          {me.activePenalties.map((p) => (
            <div
              key={p.id}
              className={`rounded-2xl border p-5 ${
                p.type === "ACCOUNT_BANNED"
                  ? "border-red-500/30 bg-red-500/10"
                  : "border-amber-500/30 bg-amber-500/10"
              }`}
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="shrink-0 flex items-center justify-center">
                  {p.type === "ACCOUNT_BANNED" ? (
                    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-red-500 stroke-2 stroke-linecap-round stroke-linejoin-round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-amber-500 stroke-2 stroke-linecap-round stroke-linejoin-round">
                      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                  )}
                </span>
                <span
                  className={`text-sm font-bold ${
                    p.type === "ACCOUNT_BANNED" ? "text-red-400" : "text-amber-400"
                  }`}
                >
                  {p.type === "ACCOUNT_BANNED" ? "账号已被封禁" : "警告通知"}
                </span>
                <span className="ml-auto text-[10px] text-[hsl(var(--muted-foreground))]">
                  {new Date(p.createdAt).toLocaleDateString("zh-CN")}
                </span>
              </div>
              <p
                className={`text-sm ${
                  p.type === "ACCOUNT_BANNED"
                    ? "text-red-300/80"
                    : "text-amber-300/80"
                }`}
              >
                原因：{p.reason}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-4 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
        {me.avatarUrl ? (
          <img
            src={me.avatarUrl}
            alt={me.nickname || "头像"}
            className="h-16 w-16 rounded-full object-cover shadow-lg shadow-brand-blue/25"
            referrerPolicy="no-referrer"
            onError={(e) => {
              // Fallback to initial-letter circle on load error
              const target = e.currentTarget;
              target.style.display = "none";
              target.nextElementSibling?.classList.remove("hidden");
            }}
          />
        ) : null}
        <div className={`flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#1677ff] to-[#0958d9] text-2xl font-bold text-white shadow-lg shadow-brand-blue/25 ${me.avatarUrl ? "hidden" : ""}`}>
          {(me.nickname || me.qqNumber || "?").charAt(0).toUpperCase()}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-[hsl(var(--foreground))]">
              {me.nickname || "未设置昵称"}
            </h1>
            <button
              type="button"
              onClick={() => setShowChangeNickname(true)}
              className="shrink-0 rounded-md border border-[hsl(var(--border))] px-2 py-0.5 text-[11px] font-medium text-[hsl(var(--muted-foreground))] transition-colors hover:border-brand-blue hover:bg-brand-blue/10 hover:text-brand-blue"
            >
              编辑
            </button>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="rounded-md bg-[hsl(var(--secondary))] px-2 py-0.5 text-[11px] font-medium text-[hsl(var(--muted-foreground))]">
              {ROLE_LABELS[me.role] || me.role}
            </span>
            {statusInfo && (
              <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusInfo.cls}`}>
                {statusInfo.label}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Account Info */}
      <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
        <h2 className="mb-2 text-sm font-semibold text-[hsl(var(--foreground))]">账号信息</h2>
        <InfoRow
          icon={
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500 shrink-0">
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
            </div>
          }
          label="QQ号"
          value={me.qqNumber}
        />
        <InfoRow
          icon={
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500 shrink-0">
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
                <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
                <path d="M7 7h.01" />
              </svg>
            </div>
          }
          label="昵称"
          value={me.nickname}
        />
        <InfoRow
          icon={
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-500 shrink-0">
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
          }
          label="角色"
          value={ROLE_LABELS[me.role]}
        />
        <InfoRow
          icon={
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500 shrink-0">
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
            </div>
          }
          label="账号状态"
          badge={statusInfo}
        />
        <InfoRow
          icon={
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/10 text-teal-500 shrink-0">
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
          }
          label="群认证"
          badge={memberInfo || undefined}
          value={!memberInfo ? "未认证" : undefined}
        />
        {me.membershipExpiresAt && me.membershipStatus === "VERIFIED" && (
          <InfoRow
            icon={
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500 shrink-0">
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </div>
            }
            label="认证到期"
            value={new Date(me.membershipExpiresAt).toLocaleDateString("zh-CN")}
          />
        )}
      </div>

      {/* Quick Links */}
      <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
        <h2 className="mb-3 text-sm font-semibold text-[hsl(var(--foreground))]">快捷入口</h2>
        <div className="space-y-1">
          <Link
            href="/profile/edit"
            className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--secondary))]"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-500 shrink-0">
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </div>
            编辑资料
            <span className="ml-auto text-xs text-[hsl(var(--muted-foreground))]">→</span>
          </Link>
          <Link
            href="/report"
            className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--secondary))]"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500 shrink-0">
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            举报中心
            <span className="ml-auto text-xs text-[hsl(var(--muted-foreground))]">→</span>
          </Link>
          {isScorer && (
            <Link
              href="/scoring"
              className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--secondary))]"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-pink-500/10 text-pink-500 shrink-0">
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
                  <circle cx="12" cy="12" r="10" />
                  <circle cx="12" cy="12" r="6" />
                  <circle cx="12" cy="12" r="2" />
                </svg>
              </div>
              评分任务
              <span className="ml-auto text-xs text-[hsl(var(--muted-foreground))]">→</span>
            </Link>
          )}
          {isAdmin && (
            <Link
              href="/dashboard"
              className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--secondary))]"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600/10 text-blue-600 shrink-0">
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l-.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </div>
              管理后台
              <span className="ml-auto text-xs text-[hsl(var(--muted-foreground))]">→</span>
            </Link>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
        <h2 className="mb-3 text-sm font-semibold text-[hsl(var(--foreground))]">账号操作</h2>
        <div className="space-y-2">
          {/* Change passcode */}
          <button
            type="button"
            onClick={() => setShowChangePasscode(true)}
            className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-sm text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--secondary))]"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500 shrink-0">
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
                <path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4" />
              </svg>
            </div>
            修改密码
            <span className="ml-auto text-xs text-[hsl(var(--muted-foreground))]">→</span>
          </button>

          {/* Delete account — hidden for super admins */}
          {me.role !== "SUPER_ADMIN" && (
            <button
              type="button"
              onClick={() => setShowDeleteAccount(true)}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-sm text-[hsl(0,60%,65%)] transition-colors hover:bg-[hsl(0,60%,50%/0.08)]"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10 text-red-500 shrink-0">
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              </div>
              删除账号
              <span className="ml-auto text-xs text-[hsl(var(--muted-foreground))]">→</span>
            </button>
          )}
        </div>
      </div>

      {/* Logout */}
      <button
        type="button"
        onClick={handleLogout}
        disabled={loggingOut}
        className="w-full rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] py-3.5 text-sm font-medium text-[hsl(0,60%,65%)] transition-all hover:border-[hsl(0,60%,50%/0.3)] hover:bg-[hsl(0,60%,50%/0.05)] disabled:opacity-50"
      >
        {loggingOut ? "退出中..." : "退出登录"}
      </button>

      {/* Modals */}
      {showChangePasscode && (
        <ChangePasscodeModal onClose={() => setShowChangePasscode(false)} />
      )}
      {showChangeNickname && (
        <ChangeNicknameModal
          currentNickname={me.nickname || ""}
          onClose={() => setShowChangeNickname(false)}
          onSuccess={(newNickname) => {
            setMe({ ...me, nickname: newNickname });
            setShowChangeNickname(false);
          }}
        />
      )}
      {showDeleteAccount && (
        <DeleteAccountModal
          onClose={() => setShowDeleteAccount(false)}
          onSuccess={() => {
            setShowDeleteAccount(false);
            handleLogout();
          }}
        />
      )}
    </div>
  );
}
