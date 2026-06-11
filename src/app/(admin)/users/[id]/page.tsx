"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { getAttributeLabel } from "@/data/attributes";
import type { Attribute } from "@prisma/client";

/* ─── Types ──────────────────────────────────────────── */

interface PenaltyItem {
  id: string;
  type: string;
  reason: string;
  createdAt: string;
  revokedAt: string | null;
  createdBy: { id: string; nickname: string | null };
}

interface AuditItem {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface UserDetail {
  id: string;
  qqNumber: string | null;
  nickname: string | null;
  role: string;
  status: string;
  createdAt: string;
  lastLoginAt: string | null;
  profile: {
    birthDate: string;
    heightCm: number;
    weightKg: number;
    provinceCode: string;
    cityCode: string;
    attribute: string;
    customAttribute: string | null;
    mbti: string | null;
    selfIntro: string | null;
    locationType: string;
  } | null;
  membership: {
    status: string;
    qqNumber: string;
    verifiedAt: string | null;
    expiresAt: string | null;
    revokedAt: string | null;
    remark: string | null;
  } | null;
  ratingProfile: {
    finalScore: number | null;
    ratingStatus: string;
  } | null;
  penalties: PenaltyItem[];
  recentAuditLogs: AuditItem[];
}

/* ─── Constants ──────────────────────────────────────── */

const ROLE_LABELS: Record<string, string> = {
  USER: "用户",
  SCORER: "评分员",
  ADMIN: "管理员",
  SUPER_ADMIN: "超级管理员",
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  BANNED: "bg-red-500/15 text-red-400 border-red-500/30",
  DELETED: "bg-gray-500/15 text-gray-400 border-gray-500/30",
};

const PENALTY_LABELS: Record<string, { label: string; icon: string }> = {
  WARNING: { label: "警告", icon: "⚠️" },
  ACCOUNT_BANNED: { label: "封禁", icon: "🚫" },
};

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

/* ─── Info Row ───────────────────────────────────────── */

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <span className="w-24 shrink-0 text-xs text-[hsl(var(--muted-foreground))]">{label}</span>
      <span className="text-sm text-[hsl(var(--foreground))]">{value}</span>
    </div>
  );
}

/* ─── Action Panel ───────────────────────────────────── */

function ActionPanel({
  user,
  onRefresh,
}: {
  user: UserDetail;
  onRefresh: () => void;
}) {
  const [action, setAction] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const hasActiveWarnings = user.penalties.some(
    (p) => p.type === "WARNING" && !p.revokedAt
  );

  const actions = [
    { value: "warn", label: "⚠️ 警告", show: user.status !== "BANNED" },
    { value: "ban", label: "🚫 封禁", show: user.status !== "BANNED" },
    { value: "revoke_warn", label: "↩️ 撤销警告", show: hasActiveWarnings && user.status !== "BANNED" },
    { value: "revoke_ban", label: "↩️ 撤销封禁", show: user.status === "BANNED" },
  ].filter((a) => a.show);

  async function handleSubmit() {
    if (!action) return setMsg({ text: "请选择操作", ok: false });
    if (!reason.trim()) return setMsg({ text: "请填写原因", ok: false });
    setSubmitting(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: reason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "操作失败");
      setMsg({ text: data.data?.message || "操作成功", ok: true });
      setAction("");
      setReason("");
      onRefresh();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "操作失败", ok: false });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
      <h3 className="mb-4 text-sm font-semibold text-[hsl(var(--foreground))]">🛡️ 管理操作</h3>

      <div className="mb-3 flex flex-wrap gap-2">
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

      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="操作原因..."
        rows={2}
        className="mb-3 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-3 py-2 text-sm text-[hsl(var(--foreground))] outline-none focus:border-[hsl(var(--primary))]"
      />

      {msg && (
        <p className={`mb-2 text-xs ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || !action}
        className="rounded-lg bg-gradient-to-r from-[hsl(262,83%,58%)] to-[hsl(290,70%,55%)] px-4 py-2 text-sm font-semibold text-white transition-all hover:scale-[1.02] disabled:opacity-50"
      >
        {submitting ? "处理中..." : "确认执行"}
      </button>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────── */

export default function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchUser() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${id}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || "加载失败");
      }
      const data = await res.json();
      setUser(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[hsl(var(--primary))] border-t-transparent" />
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="space-y-4">
        <Link href="/users" className="text-sm text-[hsl(var(--primary))] hover:underline">
          ← 返回用户列表
        </Link>
        <div className="rounded-lg border border-[hsl(0,62%,50%/0.3)] bg-[hsl(0,62%,50%/0.1)] px-4 py-3 text-sm text-[hsl(0,62%,70%)]">
          {error || "用户不存在"}
        </div>
      </div>
    );
  }

  const statusCls = STATUS_COLORS[user.status] || "";

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link href="/users" className="inline-flex items-center gap-1 text-sm text-[hsl(var(--primary))] hover:underline">
        ← 返回用户列表
      </Link>

      {/* Header */}
      <div className="flex items-center gap-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[hsl(262,83%,58%)] to-[hsl(290,70%,55%)] text-xl font-bold text-white">
          {(user.nickname || "?").charAt(0).toUpperCase()}
        </div>
        <div>
          <h2 className="text-lg font-bold text-[hsl(var(--foreground))]">
            {user.nickname || "未设置昵称"}
          </h2>
          <div className="mt-1 flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
            <span>QQ: {user.qqNumber || "—"}</span>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusCls}`}>
              {user.status}
            </span>
            <span className="rounded-full bg-[hsl(var(--secondary))] px-2 py-0.5">
              {ROLE_LABELS[user.role] || user.role}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Profile */}
        <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
          <h3 className="mb-3 text-sm font-semibold text-[hsl(var(--foreground))]">📋 个人资料</h3>
          {user.profile ? (
            <div className="divide-y divide-[hsl(var(--border)/0.5)]">
              <InfoRow label="出生日期" value={formatDateTime(user.profile.birthDate)?.split(" ")[0]} />
              <InfoRow label="身高" value={`${user.profile.heightCm} cm`} />
              <InfoRow label="体重" value={`${user.profile.weightKg} kg`} />
              <InfoRow label="属性" value={getAttributeLabel(user.profile.attribute as Attribute, user.profile.customAttribute)} />
              <InfoRow label="MBTI" value={user.profile.mbti || "—"} />
              <InfoRow label="自我介绍" value={user.profile.selfIntro || "—"} />
            </div>
          ) : (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">未填写资料</p>
          )}
        </div>

        {/* Membership */}
        <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
          <h3 className="mb-3 text-sm font-semibold text-[hsl(var(--foreground))]">✅ 群认证</h3>
          {user.membership ? (
            <div className="divide-y divide-[hsl(var(--border)/0.5)]">
              <InfoRow label="状态" value={user.membership.status} />
              <InfoRow label="QQ号" value={user.membership.qqNumber} />
              <InfoRow label="认证时间" value={formatDateTime(user.membership.verifiedAt)} />
              <InfoRow label="到期时间" value={formatDateTime(user.membership.expiresAt)} />
              {user.membership.revokedAt && (
                <InfoRow label="撤销时间" value={formatDateTime(user.membership.revokedAt)} />
              )}
              {user.membership.remark && (
                <InfoRow label="备注" value={user.membership.remark} />
              )}
            </div>
          ) : (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">无群认证记录</p>
          )}

          {/* Rating */}
          {user.ratingProfile && (
            <div className="mt-4 border-t border-[hsl(var(--border)/0.5)] pt-4">
              <h4 className="mb-2 text-xs font-semibold text-[hsl(var(--muted-foreground))]">评分信息</h4>
              <InfoRow label="状态" value={user.ratingProfile.ratingStatus} />
              <InfoRow
                label="颜值分"
                value={
                  user.ratingProfile.finalScore !== null
                    ? `⭐ ${user.ratingProfile.finalScore.toFixed(1)}`
                    : "—"
                }
              />
            </div>
          )}
        </div>

        {/* Action Panel */}
        <ActionPanel user={user} onRefresh={fetchUser} />

        {/* Penalties */}
        <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
          <h3 className="mb-3 text-sm font-semibold text-[hsl(var(--foreground))]">
            ⚖️ 处罚记录 ({user.penalties.length})
          </h3>
          {user.penalties.length === 0 ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">无处罚记录</p>
          ) : (
            <div className="space-y-3">
              {user.penalties.map((p) => {
                const info = PENALTY_LABELS[p.type] || { label: p.type, icon: "📌" };
                return (
                  <div
                    key={p.id}
                    className="rounded-lg border border-[hsl(var(--border)/0.5)] bg-[hsl(var(--secondary)/0.3)] p-3"
                  >
                    <div className="flex items-center gap-2">
                      <span>{info.icon}</span>
                      <span className="text-xs font-medium text-[hsl(var(--foreground))]">{info.label}</span>
                      {p.revokedAt && (
                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-400">
                          已撤销
                        </span>
                      )}
                      <span className="ml-auto text-[10px] text-[hsl(var(--muted-foreground))]">
                        {formatDateTime(p.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{p.reason}</p>
                    <p className="mt-1 text-[10px] text-[hsl(var(--muted-foreground))]">
                      操作人: {p.createdBy.nickname || p.createdBy.id}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Audit Logs */}
      <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
        <h3 className="mb-3 text-sm font-semibold text-[hsl(var(--foreground))]">
          📋 最近操作日志 ({user.recentAuditLogs.length})
        </h3>
        {user.recentAuditLogs.length === 0 ? (
          <p className="text-sm text-[hsl(var(--muted-foreground))]">无操作日志</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[hsl(var(--border))] text-left text-[hsl(var(--muted-foreground))]">
                  <th className="px-3 py-2 font-medium">操作</th>
                  <th className="px-3 py-2 font-medium">目标</th>
                  <th className="px-3 py-2 font-medium">详情</th>
                  <th className="px-3 py-2 font-medium">时间</th>
                </tr>
              </thead>
              <tbody>
                {user.recentAuditLogs.map((log) => (
                  <tr key={log.id} className="border-b border-[hsl(var(--border)/0.3)]">
                    <td className="px-3 py-2 font-mono">{log.action}</td>
                    <td className="px-3 py-2 text-[hsl(var(--muted-foreground))]">
                      {log.targetType ? `${log.targetType}` : "—"}
                    </td>
                    <td className="max-w-[200px] truncate px-3 py-2 text-[hsl(var(--muted-foreground))]">
                      {log.metadata ? JSON.stringify(log.metadata) : "—"}
                    </td>
                    <td className="px-3 py-2 text-[hsl(var(--muted-foreground))]">
                      {formatDateTime(log.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
