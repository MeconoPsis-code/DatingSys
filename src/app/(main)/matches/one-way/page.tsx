"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getProvinceName } from "@/data/regions";
import { ATTRIBUTE_LABELS } from "@/data/attributes";
import Link from "next/link";
import { usePathname } from "next/navigation";

/* ─── Types ──────────────────────────────────────────── */

interface OneWayMatch {
  userId: string;
  ageRange: string;
  province: string;
  heightRange: string;
  attribute: string;
  hasPhotos: boolean;
  direction: "i_like" | "likes_me";
  relevanceScore: number;
}

/* ─── Match Tabs ─────────────────────────────────────── */

function MatchTabs() {
  const pathname = usePathname();
  const tabs = [
    { label: "双向匹配", href: "/matches/mutual", icon: "💕" },
    { label: "单向匹配", href: "/matches/one-way", icon: "💌" },
  ];

  return (
    <div className="flex gap-1 rounded-xl bg-[hsl(var(--secondary))] p-1">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
            pathname === tab.href
              ? "bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-sm"
              : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
          }`}
        >
          <span>{tab.icon}</span>
          {tab.label}
        </Link>
      ))}
    </div>
  );
}

/* ─── Helpers ────────────────────────────────────────── */

function getAttrLabel(attr: string): string {
  return (ATTRIBUTE_LABELS as Record<string, string>)[attr] ?? attr;
}

/* ─── One-Way Match Card ─────────────────────────────── */

function OneWayMatchCard({
  match,
  onRequestView,
  viewRequestStatus,
}: {
  match: OneWayMatch;
  onRequestView: (userId: string) => void;
  viewRequestStatus: string | null; // null, "PENDING", "APPROVED", "REJECTED"
}) {
  const isILike = match.direction === "i_like";

  return (
    <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 transition-all hover:border-[hsl(var(--primary)/0.3)]">
      {/* Direction badge */}
      <div className="mb-3">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${
            isILike
              ? "border border-blue-500/30 bg-blue-500/15 text-blue-400"
              : "border border-emerald-500/30 bg-emerald-500/15 text-emerald-400"
          }`}
        >
          {isILike ? "→ 我符合对方条件" : "← 对方符合我的条件"}
        </span>
      </div>

      {/* Blurred stats */}
      <div className="mb-4 flex flex-wrap gap-2">
        <span className="rounded-lg bg-[hsl(var(--secondary))] px-2.5 py-1 text-xs text-[hsl(var(--foreground))]">
          🎂 {match.ageRange} 岁
        </span>
        <span className="rounded-lg bg-[hsl(var(--secondary))] px-2.5 py-1 text-xs text-[hsl(var(--foreground))]">
          📍 {getProvinceName(match.province)}
        </span>
        <span className="rounded-lg bg-[hsl(var(--secondary))] px-2.5 py-1 text-xs text-[hsl(var(--foreground))]">
          📏 {match.heightRange} cm
        </span>
        <span className="rounded-lg bg-[hsl(var(--secondary))] px-2.5 py-1 text-xs text-[hsl(var(--foreground))]">
          {getAttrLabel(match.attribute)}
        </span>
        {match.hasPhotos && (
          <span className="rounded-full border border-purple-500/30 bg-purple-500/15 px-2 py-0.5 text-[10px] font-medium text-purple-400">
            📷 有照片
          </span>
        )}
      </div>

      {/* Action */}
      <div>
        {viewRequestStatus === "PENDING" && (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-[hsl(var(--secondary))] px-3 py-1.5 text-xs text-[hsl(var(--muted-foreground))]">
            ⏳ 查看申请待审核
          </span>
        )}
        {viewRequestStatus === "APPROVED" && (
          <Link
            href={`/matches/${match.userId}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-all hover:scale-[1.02]"
          >
            ✅ 已通过 · 查看资料
          </Link>
        )}
        {viewRequestStatus === "REJECTED" && (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-[hsl(0,60%,50%/0.3)] bg-[hsl(0,60%,50%/0.1)] px-3 py-1.5 text-xs text-[hsl(0,60%,65%)]">
            ❌ 申请已被拒绝
          </span>
        )}
        {viewRequestStatus === null && (
          <button
            type="button"
            onClick={() => onRequestView(match.userId)}
            className="rounded-lg bg-gradient-to-r from-[hsl(262,83%,58%)] to-[hsl(290,70%,55%)] px-4 py-2 text-xs font-semibold text-white shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            申请查看资料
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────── */

export default function OneWayMatchesPage() {
  const [matches, setMatches] = useState<OneWayMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scoringPending, setScoringPending] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [viewRequestMap, setViewRequestMap] = useState<Record<string, string>>({});
  const [requesting, setRequesting] = useState(false);
  const [filter, setFilter] = useState<"all" | "i_like" | "likes_me">("all");
  const pageSize = 20;
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchMatches = useCallback(async () => {
    setLoading(true);
    setError(null);
    setScoringPending(false);
    try {
      const res = await fetch(
        `/api/matches?type=one_way&page=${page}&pageSize=${pageSize}`
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || "加载失败");
      }
      const data = await res.json();

      if (data.data?.status === "scoring_pending") {
        setScoringPending(true);
        setMatches([]);
        return;
      }

      setMatches(data.data || []);
      if (data.pagination) {
        setTotalPages(data.pagination.totalPages);
        setTotal(data.pagination.total);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [page]);

  // Load existing view requests
  const fetchViewRequests = useCallback(async () => {
    try {
      const res = await fetch("/api/view-requests?type=outgoing&status=all&pageSize=100");
      if (res.ok) {
        const data = await res.json();
        const map: Record<string, string> = {};
        for (const req of data.data || []) {
          // Keep the most recent status for each target
          if (!map[req.targetUserId] || req.status === "PENDING" || req.status === "APPROVED") {
            map[req.targetUserId] = req.status;
          }
        }
        setViewRequestMap(map);
      }
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    fetchMatches();
    fetchViewRequests();
  }, [fetchMatches, fetchViewRequests]);

  async function handleRequestView(targetUserId: string) {
    setRequesting(true);
    try {
      const res = await fetch("/api/view-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "申请失败");
      }
      // Update local state
      setViewRequestMap((prev) => ({ ...prev, [targetUserId]: "PENDING" }));
    } catch (err) {
      alert(err instanceof Error ? err.message : "申请失败");
    } finally {
      setRequesting(false);
    }
  }

  const filteredMatches =
    filter === "all"
      ? matches
      : matches.filter((m) => m.direction === filter);

  const iLikeCount = matches.filter((m) => m.direction === "i_like").length;
  const likesMeCount = matches.filter((m) => m.direction === "likes_me").length;

  return (
    <div ref={scrollRef} className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">匹配结果</h1>

      <MatchTabs />

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-[hsl(0,62%,50%/0.3)] bg-[hsl(0,62%,50%/0.1)] px-4 py-3 text-sm text-[hsl(0,62%,70%)]">
          {error}
        </div>
      )}

      {/* Scoring pending */}
      {scoringPending && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] py-16">
          <div className="mb-4 text-5xl">⏳</div>
          <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">
            评分中，请耐心等待
          </h2>
          <p className="mt-2 max-w-xs text-center text-sm text-[hsl(var(--muted-foreground))]">
            您的照片正在被评分组审核，评分完成后即可查看匹配结果。
          </p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[hsl(var(--primary))] border-t-transparent" />
        </div>
      )}

      {/* Direction filter */}
      {!loading && !scoringPending && matches.length > 0 && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              filter === "all"
                ? "bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))]"
                : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            }`}
          >
            全部 ({total})
          </button>
          <button
            type="button"
            onClick={() => setFilter("i_like")}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              filter === "i_like"
                ? "bg-blue-500/15 text-blue-400"
                : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            }`}
          >
            → 我符合 ({iLikeCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter("likes_me")}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              filter === "likes_me"
                ? "bg-emerald-500/15 text-emerald-400"
                : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            }`}
          >
            ← 符合我 ({likesMeCount})
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !scoringPending && !error && matches.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] py-16">
          <div className="mb-3 text-5xl">💌</div>
          <h2 className="text-base font-semibold text-[hsl(var(--foreground))]">
            暂无单向匹配
          </h2>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            尝试调整偏好条件以获得更多匹配
          </p>
        </div>
      )}

      {/* Match cards */}
      {!loading && (
        <div className="space-y-4">
          {filteredMatches.map((match) => (
            <OneWayMatchCard
              key={match.userId}
              match={match}
              onRequestView={handleRequestView}
              viewRequestStatus={viewRequestMap[match.userId] ?? null}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 py-4">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => { setPage(page - 1); scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" }); }}
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
            onClick={() => { setPage(page + 1); scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" }); }}
            className="rounded-lg border border-[hsl(var(--border))] px-3 py-1.5 text-sm font-medium text-[hsl(var(--foreground))] transition-all hover:bg-[hsl(var(--secondary))] disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      )}

      {/* Requesting overlay */}
      {requesting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
        </div>
      )}
    </div>
  );
}
