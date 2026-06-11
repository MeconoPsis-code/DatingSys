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
  icon: string;
  label: string;
  value?: React.ReactNode;
  badge?: { label: string; cls: string };
}) {
  return (
    <div className="flex items-center gap-3 border-b border-[hsl(var(--border)/0.3)] px-1 py-3.5 last:border-b-0">
      <span className="text-base">{icon}</span>
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
        <h3 className="mb-5 text-base font-semibold text-[hsl(var(--foreground))]">🔑 修改密码</h3>

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
            className="flex-1 rounded-lg bg-gradient-to-r from-[hsl(262,83%,58%)] to-[hsl(290,70%,55%)] py-2.5 text-sm font-semibold text-white transition-all hover:scale-[1.02] disabled:opacity-50"
          >
            {submitting ? "修改中..." : "确认修改"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ─── Clear Profile Modal ────────────────────────────── */

function ClearProfileModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const CONFIRM_TEXT = "确认清空我的资料";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (confirmation !== CONFIRM_TEXT) {
      return setMsg({ text: `请输入「${CONFIRM_TEXT}」以确认`, ok: false });
    }

    setSubmitting(true);
    setMsg(null);
    try {
      const res = await fetch("/api/profile/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "清空失败");
      setMsg({ text: "资料已清空", ok: true });
      setTimeout(onSuccess, 1500);
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : "清空失败", ok: false });
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
        <h3 className="mb-2 text-base font-semibold text-[hsl(0,60%,65%)]">⚠️ 清空资料</h3>
        <p className="mb-4 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
          此操作将<strong className="text-[hsl(0,60%,65%)]">永久删除</strong>您的个人资料和偏好设置。
          清空后 <strong>30天内</strong>不能重新发布资料。
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
            {submitting ? "清空中..." : "确认清空"}
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
  const [showClearProfile, setShowClearProfile] = useState(false);
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
                <span className="text-lg">
                  {p.type === "ACCOUNT_BANNED" ? "🚫" : "⚠️"}
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
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[hsl(262,83%,58%)] to-[hsl(290,70%,55%)] text-2xl font-bold text-white shadow-lg shadow-[hsl(262,83%,58%/0.25)]">
          {(me.nickname || me.qqNumber || "?").charAt(0).toUpperCase()}
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-[hsl(var(--foreground))]">
            {me.nickname || "未设置昵称"}
          </h1>
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
        <InfoRow icon="💬" label="QQ号" value={me.qqNumber} />
        <InfoRow icon="🏷️" label="昵称" value={me.nickname} />
        <InfoRow icon="🛡️" label="角色" value={ROLE_LABELS[me.role]} />
        <InfoRow icon="📊" label="账号状态" badge={statusInfo} />
        <InfoRow
          icon="✅"
          label="群认证"
          badge={memberInfo || undefined}
          value={!memberInfo ? "未认证" : undefined}
        />
        {me.membershipExpiresAt && me.membershipStatus === "VERIFIED" && (
          <InfoRow
            icon="📅"
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
            className="flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--secondary))]"
          >
            <span className="text-base">✏️</span>
            编辑资料
            <span className="ml-auto text-xs text-[hsl(var(--muted-foreground))]">→</span>
          </Link>
          <Link
            href="/report"
            className="flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--secondary))]"
          >
            <span className="text-base">🚨</span>
            举报中心
            <span className="ml-auto text-xs text-[hsl(var(--muted-foreground))]">→</span>
          </Link>
          {isScorer && (
            <Link
              href="/scoring"
              className="flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--secondary))]"
            >
              <span className="text-base">🎯</span>
              评分任务
              <span className="ml-auto text-xs text-[hsl(var(--muted-foreground))]">→</span>
            </Link>
          )}
          {isAdmin && (
            <Link
              href="/dashboard"
              className="flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--secondary))]"
            >
              <span className="text-base">⚙️</span>
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
            className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-sm text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--secondary))]"
          >
            <span className="text-base">🔑</span>
            修改密码
            <span className="ml-auto text-xs text-[hsl(var(--muted-foreground))]">→</span>
          </button>

          {/* Clear profile */}
          <button
            type="button"
            onClick={() => setShowClearProfile(true)}
            className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-sm text-[hsl(0,60%,65%)] transition-colors hover:bg-[hsl(0,60%,50%/0.08)]"
          >
            <span className="text-base">🗑️</span>
            清空资料
            <span className="ml-auto text-xs text-[hsl(var(--muted-foreground))]">→</span>
          </button>
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
      {showClearProfile && (
        <ClearProfileModal
          onClose={() => setShowClearProfile(false)}
          onSuccess={() => {
            setShowClearProfile(false);
            router.push("/profile");
          }}
        />
      )}
    </div>
  );
}
