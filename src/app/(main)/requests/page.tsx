"use client";

import { useState, useEffect, useCallback } from "react";
import { getProvinceName, getCityName } from "@/data/regions";
import { ATTRIBUTE_LABELS } from "@/data/attributes";

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
  targetNickname: string | null;
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

  return (
    <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 transition-all">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[hsl(262,83%,58%)] to-[hsl(290,70%,55%)] text-sm font-bold text-white">
            {(request.requesterNickname || "?").charAt(0)}
          </div>
          <div>
            <div className="text-sm font-medium text-[hsl(var(--foreground))]">
              {request.requesterNickname || "匿名用户"}
            </div>
            <div className="text-xs text-[hsl(var(--muted-foreground))]">
              {timeAgo(request.createdAt)}
            </div>
          </div>
        </div>
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusInfo.color}`}>
          {statusInfo.label}
        </span>
      </div>

      {/* Requester profile summary */}
      {request.requesterProfile && (
        <div className="mb-3 flex flex-wrap gap-2">
          <span className="rounded-lg bg-[hsl(var(--secondary))] px-2 py-1 text-xs text-[hsl(var(--foreground))]">
            🎂 {request.requesterProfile.age} 岁
          </span>
          <span className="rounded-lg bg-[hsl(var(--secondary))] px-2 py-1 text-xs text-[hsl(var(--foreground))]">
            📏 {request.requesterProfile.heightCm} cm
          </span>
          <span className="rounded-lg bg-[hsl(var(--secondary))] px-2 py-1 text-xs text-[hsl(var(--foreground))]">
            ⚖️ {request.requesterProfile.weightKg} kg
          </span>
          <span className="rounded-lg bg-[hsl(var(--secondary))] px-2 py-1 text-xs text-[hsl(var(--foreground))]">
            📍 {getProvinceName(request.requesterProfile.provinceCode)} · {getCityName(request.requesterProfile.provinceCode, request.requesterProfile.cityCode)}
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
        <div className="flex gap-2">
          <button
            type="button"
            disabled={responding === request.id}
            onClick={() => onRespond(request.id, "approve")}
            className="flex-1 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
          >
            {responding === request.id ? "处理中..." : "✅ 通过"}
          </button>
          <button
            type="button"
            disabled={responding === request.id}
            onClick={() => onRespond(request.id, "reject")}
            className="flex-1 rounded-lg border border-[hsl(var(--border))] px-4 py-2 text-sm font-medium text-[hsl(var(--foreground))] transition-all hover:bg-[hsl(var(--secondary))] disabled:opacity-50"
          >
            ❌ 拒绝
          </button>
        </div>
      )}

      {/* Responded info */}
      {request.respondedAt && (
        <div className="text-xs text-[hsl(var(--muted-foreground))]">
          处理于 {formatDate(request.respondedAt)}
        </div>
      )}
    </div>
  );
}

/* ─── Outgoing Card ──────────────────────────────────── */

function OutgoingRequestCard({ request }: { request: ViewRequest }) {
  const statusInfo = STATUS_MAP[request.status] ?? STATUS_MAP.PENDING;

  return (
    <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 transition-all">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[hsl(200,80%,55%)] to-[hsl(220,70%,50%)] text-sm font-bold text-white">
            {(request.targetNickname || "?").charAt(0)}
          </div>
          <div>
            <div className="text-sm font-medium text-[hsl(var(--foreground))]">
              → {request.targetNickname || "匿名用户"}
            </div>
            <div className="text-xs text-[hsl(var(--muted-foreground))]">
              {timeAgo(request.createdAt)}
            </div>
          </div>
        </div>
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusInfo.color}`}>
          {statusInfo.label}
        </span>
      </div>
      {request.message && (
        <div className="mt-3 rounded-lg bg-[hsl(var(--secondary)/0.5)] px-3 py-2 text-xs text-[hsl(var(--muted-foreground))]">
          &ldquo;{request.message}&rdquo;
        </div>
      )}
      {request.status === "APPROVED" && request.requesterQQ && (
        <div className="mt-3 text-xs text-emerald-400">
          ✅ 对方已通过，可在匹配页面查看完整资料
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
    fetchRequests();
    fetchPendingCount();
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
      <h1 className="text-2xl font-bold">📨 查看申请</h1>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-[hsl(var(--secondary))] p-1">
        <button
          onClick={() => { setTab("incoming"); setPage(1); }}
          className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
            tab === "incoming"
              ? "bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-sm"
              : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
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
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
            tab === "outgoing"
              ? "bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-sm"
              : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
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
          <div className="mb-3 text-4xl">
            {tab === "incoming" ? "📭" : "📤"}
          </div>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            {tab === "incoming" ? "暂无收到的申请" : "暂无发出的申请"}
          </p>
        </div>
      )}

      {/* Cards */}
      {!loading && (
        <div className="space-y-4">
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
