"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { getProvinceName, getCityName } from "@/data/regions";
import { ATTRIBUTE_LABELS } from "@/data/attributes";
import {
  getAvatarColor,
  getInitial,
  getMaskedIdentity,
} from "@/lib/pseudonymous-identity";
import { formatBmi } from "@/lib/bmi";

/* ─── Types ──────────────────────────────────────────── */

interface RequesterProfile {
  age: number;
  heightCm: number;
  weightKg: number;
  provinceCode: string;
  cityCode: string;
  attribute: string;
  customAttribute: string | null;
  mbti: string | null;
}

interface ViewRequest {
  id: string;
  requesterId: string;
  targetUserId: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | "CANCELLED";
  message: string | null;
  respondedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  requesterNickname: string | null;
  requesterQQ: string | null;
  requesterAvatarUrl: string | null;
  targetNickname: string | null;
  targetQQ: string | null;
  targetAvatarUrl: string | null;
  requesterProfile?: RequesterProfile;
}

/* ─── Helpers ────────────────────────────────────────── */

function getAttrLabel(attr: string, custom?: string | null): string {
  if (attr === "OTHER" && custom) return `其他: ${custom}`;
  return (ATTRIBUTE_LABELS as Record<string, string>)[attr] ?? attr;
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function timeAgo(d: string): string {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  PENDING: { label: "待处理", color: "border-blue-500/30 bg-blue-500/15 text-blue-400" },
  APPROVED: { label: "已通过", color: "border-emerald-500/30 bg-emerald-500/15 text-emerald-400" },
  REJECTED: { label: "已拒绝", color: "border-red-500/30 bg-red-500/15 text-red-400" },
  EXPIRED: { label: "已过期", color: "border-gray-500/30 bg-gray-500/15 text-gray-400" },
  CANCELLED: { label: "已取消", color: "border-gray-500/30 bg-gray-500/15 text-gray-400" },
};

function getVisibleRequestIdentity({
  userId,
  nickname,
  avatarUrl,
  unlocked,
}: {
  userId: string;
  nickname: string | null;
  avatarUrl: string | null;
  unlocked: boolean;
}) {
  if (unlocked) {
    return {
      name: nickname || "匿名用户",
      letter: getInitial(nickname),
      color: getAvatarColor(userId),
      avatarUrl,
      avatarLabel: "用户头像",
    };
  }

  return {
    ...getMaskedIdentity(userId),
    avatarUrl: null,
    avatarLabel: "随机头像",
  };
}

function ViewFullProfileButton({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow transition-all hover:scale-[1.02] active:scale-[0.98]"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      查看完整资料
    </Link>
  );
}

function ReportProfileIconLink({ targetQQ }: { targetQQ: string }) {
  return (
    <Link
      href={`/report?targetQQ=${encodeURIComponent(targetQQ)}`}
      aria-label="举报"
      title="举报"
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all hover:bg-red-500/10 active:scale-95"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/report-icon.png"
        alt=""
        aria-hidden="true"
        className="h-5 w-5 object-contain mix-blend-multiply"
      />
    </Link>
  );
}

/* ─── Incoming Card ──────────────────────────────────── */

function IncomingRequestCard({
  request,
  onRespond,
  responding,
}: {
  request: ViewRequest;
  onRespond: (id: string, action: "approve" | "reject") => void;
  responding: string | null;
}) {
  const isPending = request.status === "PENDING";
  const statusInfo = STATUS_MAP[request.status] ?? STATUS_MAP.PENDING;
  const identity = getVisibleRequestIdentity({
    userId: request.requesterId,
    nickname: request.requesterNickname,
    avatarUrl: request.requesterAvatarUrl,
    unlocked: request.status === "APPROVED",
  });

  return (
    <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 transition-all sm:p-5">
      {/* Header */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div
            aria-label={identity.avatarLabel}
            className={`flex h-9 w-9 items-center justify-center overflow-hidden rounded-full ${
              identity.avatarUrl
                ? "bg-white"
                : `bg-gradient-to-br ${identity.color} text-sm font-bold text-white`
            }`}
          >
            {identity.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={identity.avatarUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              identity.letter
            )}
          </div>
          <div>
            <div className="text-sm font-medium text-[hsl(var(--foreground))]">
              {identity.name}
            </div>
            <div className="text-xs text-[hsl(var(--muted-foreground))]">
              {timeAgo(request.createdAt)}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {request.status === "APPROVED" && request.requesterQQ && (
            <ReportProfileIconLink targetQQ={request.requesterQQ} />
          )}
          <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusInfo.color}`}>
            {statusInfo.label}
          </span>
        </div>
      </div>

      {/* Requester profile summary */}
      {request.requesterProfile && (
        <div className="mb-3 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1 rounded-lg bg-[hsl(var(--secondary))] px-2 py-1 text-xs text-[hsl(var(--foreground))]">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round text-[hsl(var(--muted-foreground))]">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
              <path d="M8 14h.01" />
              <path d="M12 14h.01" />
              <path d="M16 14h.01" />
              <path d="M8 18h.01" />
              <path d="M12 18h.01" />
              <path d="M16 18h.01" />
            </svg>
            <span>{request.requesterProfile.age} 岁</span>
          </span>
          <span className="inline-flex items-center gap-1 rounded-lg bg-[hsl(var(--secondary))] px-2 py-1 text-xs text-[hsl(var(--foreground))]">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round text-[hsl(var(--muted-foreground))]">
              <path d="M21.3 15.3a2.82 2.82 0 0 1 0 4c-1 1-2.5 1-3.5 0L2.8 4.3a2.82 2.82 0 0 1 0-4c1-1 2.5-1 3.5 0Z" />
              <path d="m5.6 7.2 1.4-1.4" />
              <path d="m8.4 10 1.4-1.4" />
              <path d="m11.2 12.8 1.4-1.4" />
              <path d="m14 15.6 1.4-1.4" />
              <path d="m16.8 18.5 1.4-1.4" />
            </svg>
            <span>{request.requesterProfile.heightCm} cm</span>
          </span>
          <span className="inline-flex items-center gap-1 rounded-lg bg-[hsl(var(--secondary))] px-2 py-1 text-xs text-[hsl(var(--foreground))]">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round text-[hsl(var(--muted-foreground))]">
              <path d="m16 16 3-8 3 8c-.87.65-2.24 1-3 1s-2.13-.35-3-1Z" />
              <path d="m2 16 3-8 3 8c-.87.65-2.24 1-3 1s-2.13-.35-3-1Z" />
              <path d="M7 21h10" />
              <path d="M12 3v18" />
              <path d="M3 7h18" />
            </svg>
            <span>{request.requesterProfile.weightKg} kg</span>
          </span>
          <span className="rounded-lg bg-[hsl(var(--secondary))] px-2 py-1 text-xs text-[hsl(var(--foreground))]">
            BMI {formatBmi(request.requesterProfile.heightCm, request.requesterProfile.weightKg)}
          </span>
          <span className="inline-flex items-center gap-1 rounded-lg bg-[hsl(var(--secondary))] px-2 py-1 text-xs text-[hsl(var(--foreground))]">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round text-[hsl(var(--muted-foreground))]">
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <span>{getProvinceName(request.requesterProfile.provinceCode)} · {getCityName(request.requesterProfile.provinceCode, request.requesterProfile.cityCode)}</span>
          </span>
          <span className="rounded-lg bg-[hsl(var(--secondary))] px-2 py-1 text-xs text-[hsl(var(--foreground))]">
            {getAttrLabel(request.requesterProfile.attribute, request.requesterProfile.customAttribute)}
          </span>
          {request.requesterProfile.mbti && (
            <span className="rounded-lg bg-[hsl(var(--secondary))] px-2 py-1 text-xs text-[hsl(var(--foreground))]">
              {request.requesterProfile.mbti}
            </span>
          )}
        </div>
      )}

      {/* Message */}
      {request.message && (
        <div className="mb-3 rounded-lg bg-[hsl(var(--secondary)/0.5)] px-3 py-2 text-xs text-[hsl(var(--muted-foreground))]">
          &ldquo;{request.message}&rdquo;
        </div>
      )}

      {/* Actions for pending */}
      {isPending && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            disabled={responding === request.id}
            onClick={() => onRespond(request.id, "approve")}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
          >
            {responding === request.id ? (
              "处理中..."
            ) : (
              <>
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                通过
              </>
            )}
          </button>
          <button
            type="button"
            disabled={responding === request.id}
            onClick={() => onRespond(request.id, "reject")}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-[hsl(var(--border))] px-4 py-2 text-sm font-medium text-[hsl(var(--foreground))] transition-all hover:bg-[hsl(var(--secondary))] disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            拒绝
          </button>
        </div>
      )}

      {/* Responded info */}
      {request.respondedAt && (
        <div className="text-xs text-[hsl(var(--muted-foreground))]">
          处理于 {formatDate(request.respondedAt)}
        </div>
      )}

      {/* View requester profile link for APPROVED requests */}
      {request.status === "APPROVED" && (
        <div className="mt-3 flex flex-col gap-3">
          <ViewFullProfileButton href={`/matches/${request.requesterId}`} />
        </div>
      )}
    </div>
  );
}

/* ─── Outgoing Card ──────────────────────────────────── */

function OutgoingRequestCard({ request }: { request: ViewRequest }) {
  const statusInfo = STATUS_MAP[request.status] ?? STATUS_MAP.PENDING;
  const identity = getVisibleRequestIdentity({
    userId: request.targetUserId,
    nickname: request.targetNickname,
    avatarUrl: request.targetAvatarUrl,
    unlocked: request.status === "APPROVED",
  });

  return (
    <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 transition-all sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div
            aria-label={identity.avatarLabel}
            className={`flex h-9 w-9 items-center justify-center overflow-hidden rounded-full ${
              identity.avatarUrl
                ? "bg-white"
                : `bg-gradient-to-br ${identity.color} text-sm font-bold text-white`
            }`}
          >
            {identity.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={identity.avatarUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              identity.letter
            )}
          </div>
          <div>
            <div className="text-sm font-medium text-[hsl(var(--foreground))]">
              → {identity.name}
            </div>
            <div className="text-xs text-[hsl(var(--muted-foreground))]">
              {timeAgo(request.createdAt)}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {request.status === "APPROVED" && request.targetQQ && (
            <ReportProfileIconLink targetQQ={request.targetQQ} />
          )}
          <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusInfo.color}`}>
            {statusInfo.label}
          </span>
        </div>
      </div>
      {request.message && (
        <div className="mt-3 rounded-lg bg-[hsl(var(--secondary)/0.5)] px-3 py-2 text-xs text-[hsl(var(--muted-foreground))]">
          &ldquo;{request.message}&rdquo;
        </div>
      )}
      {request.status === "APPROVED" && (
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex items-center gap-1.5 text-xs text-emerald-400">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round shrink-0">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>对方已通过，你们已可互相查看完整资料</span>
          </div>
          <ViewFullProfileButton href={`/matches/${request.targetUserId}`} />
        </div>
      )}
      {request.status === "REJECTED" && (
        <div className="mt-3 text-xs text-[hsl(var(--muted-foreground))]">
          7 天后可重新申请
        </div>
      )}
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────── */

export default function RequestsPage() {
  const [tab, setTab] = useState<"incoming" | "outgoing">("incoming");
  const [requests, setRequests] = useState<ViewRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [responding, setResponding] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/view-requests?type=${tab}&status=all&page=${page}&pageSize=20`
      );
      if (!res.ok) throw new Error("加载失败");
      const data = await res.json();
      setRequests(data.data || []);
      if (data.pagination) {
        setTotalPages(data.pagination.totalPages);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [tab, page]);

  // Fetch pending count for incoming badge
  const fetchPendingCount = useCallback(async () => {
    try {
      const res = await fetch("/api/view-requests?type=incoming&status=pending&pageSize=1");
      if (res.ok) {
        const data = await res.json();
        setPendingCount(data.pagination?.total ?? 0);
      }
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      void fetchRequests();
      void fetchPendingCount();
    });
    return () => {
      cancelled = true;
    };
  }, [fetchRequests, fetchPendingCount]);

  async function handleRespond(id: string, action: "approve" | "reject") {
    setResponding(id);
    try {
      const res = await fetch(`/api/view-requests/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || "操作失败");
      }
      // Refresh
      await fetchRequests();
      await fetchPendingCount();
    } catch (err) {
      alert(err instanceof Error ? err.message : "操作失败");
    } finally {
      setResponding(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
        <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round text-brand-blue">
          <rect width="20" height="16" x="2" y="4" rx="2" />
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        </svg>
        查看申请
      </h1>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-[hsl(var(--secondary))] p-1">
        <button
          onClick={() => { setTab("incoming"); setPage(1); }}
            className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-all sm:px-4 sm:text-sm ${
            tab === "incoming"
              ? "bg-brand-blue text-white shadow-[0_4px_12px_rgba(22,119,255,0.15)]"
              : "text-brand-muted hover:bg-slate-100/50 hover:text-brand-text"
          }`}
        >
          收到的申请
          {pendingCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[hsl(0,72%,51%)] text-[10px] font-bold text-white">
              {pendingCount > 9 ? "9+" : pendingCount}
            </span>
          )}
        </button>
        <button
          onClick={() => { setTab("outgoing"); setPage(1); }}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-all sm:px-4 sm:text-sm ${
            tab === "outgoing"
              ? "bg-brand-blue text-white shadow-[0_4px_12px_rgba(22,119,255,0.15)]"
              : "text-brand-muted hover:bg-slate-100/50 hover:text-brand-text"
          }`}
        >
          发出的申请
        </button>
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

      {/* Empty state */}
      {!loading && !error && requests.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] py-16">
          <div className="mb-3 text-[hsl(var(--muted-foreground))]">
            {tab === "incoming" ? (
              <svg viewBox="0 0 24 24" className="h-12 w-12 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
                <rect width="20" height="16" x="2" y="4" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-12 w-12 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
                <path d="M22 12h-6l-2 3h-4l-2-3H2" />
                <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
              </svg>
            )}
          </div>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            {tab === "incoming" ? "暂无收到的申请" : "暂无发出的申请"}
          </p>
        </div>
      )}

      {/* Cards */}
      {!loading && (
        <div className="flex flex-col gap-4">
          {requests.map((req) =>
            tab === "incoming" ? (
              <IncomingRequestCard
                key={req.id}
                request={req}
                onRespond={handleRespond}
                responding={responding}
              />
            ) : (
              <OutgoingRequestCard key={req.id} request={req} />
            )
          )}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 py-4">
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
