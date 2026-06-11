"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/* ─── Types ──────────────────────────────────────────── */

interface OneWayMatch {
  userId: string;
  ageMatch: boolean;
  heightMatch: boolean;
  weightMatch: boolean;
  locationMatch: boolean;
  attributeMatch: boolean;
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

/* ─── Match Indicator ────────────────────────────────── */

function MatchBadge({ icon, label, match }: { icon: string; label: string; match: boolean }) {
  return (
    <span
      className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
        match
          ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
          : "border border-[hsl(0,60%,50%/0.3)] bg-[hsl(0,60%,50%/0.08)] text-[hsl(0,60%,65%)]"
      }`}
    >
      {icon} {label} {match ? "符合" : "不符合"}
    </span>
  );
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
  const matchCount = [match.ageMatch, match.heightMatch, match.weightMatch, match.locationMatch, match.attributeMatch].filter(Boolean).length;

  return (
    <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 transition-all hover:border-[hsl(var(--primary)/0.3)]">
      {/* Direction badge */}
      <div className="mb-3 flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${
            isILike
              ? "border border-blue-500/30 bg-blue-500/15 text-blue-400"
              : "border border-emerald-500/30 bg-emerald-500/15 text-emerald-400"
          }`}
        >
          {isILike ? "→ 我符合对方条件" : "← 对方符合我的条件"}
        </span>
        <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
          {matchCount}/5 项符合我的偏好
        </span>
      </div>

      {/* Match indicator badges */}
      <div className="mb-4 flex flex-wrap gap-2">
        <MatchBadge icon="🎂" label="年龄" match={match.ageMatch} />
        <MatchBadge icon="📏" label="身高" match={match.heightMatch} />
        <MatchBadge icon="⚖️" label="体重" match={match.weightMatch} />
        <MatchBadge icon="📍" label="地区" match={match.locationMatch} />
        <MatchBadge icon="💫" label="属性" match={match.attributeMatch} />
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
            ⏳ 资料查看申请待审核
          </span>
        )}
        {viewRequestStatus === "APPROVED" && (
          <Link
            href={`/matches/${match.userId}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-all hover:scale-[1.02]"
          >
            ✅ 已通过 · 查看完整资料
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
            🔓 申请查看完整资料
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
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);
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
      // Fetch outgoing requests (requests I sent)
      const [outRes, inRes] = await Promise.all([
        fetch("/api/view-requests?type=outgoing&status=all&pageSize=100"),
        fetch("/api/view-requests?type=incoming&status=all&pageSize=100"),
      ]);

      const map: Record<string, string> = {};

      // Outgoing: map by targetUserId
      if (outRes.ok) {
        const outData = await outRes.json();
        for (const req of outData.data || []) {
          if (!map[req.targetUserId] || req.status === "PENDING" || req.status === "APPROVED") {
            map[req.targetUserId] = req.status;
          }
        }
      }

      // Incoming APPROVED: if I approved someone's request, I also get access
      // Map by requesterId so the card for that person shows "APPROVED"
      if (inRes.ok) {
        const inData = await inRes.json();
        for (const req of inData.data || []) {
          if (req.status === "APPROVED") {
            // Only set if not already tracked (outgoing takes priority)
            if (!map[req.requesterId]) {
              map[req.requesterId] = "APPROVED";
            }
          }
        }
      }

      setViewRequestMap(map);
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    fetchMatches();
    fetchViewRequests();
  }, [fetchMatches, fetchViewRequests]);

  async function sendViewRequest(targetUserId: string) {
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
      setViewRequestMap((prev) => ({ ...prev, [targetUserId]: "PENDING" }));
    } catch (err) {
      alert(err instanceof Error ? err.message : "申请失败");
    } finally {
      setRequesting(false);
      setConfirmTarget(null);
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
              onRequestView={(userId) => setConfirmTarget(userId)}
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

      {/* View request confirmation modal */}
      {confirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-xl">
            <div className="mb-4 text-center text-3xl">🔓</div>
            <h3 className="mb-2 text-center text-base font-semibold text-[hsl(var(--foreground))]">申请查看完整资料</h3>
            <p className="mb-5 text-center text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
              申请通过后，您将可以查看对方的<span className="font-medium text-[hsl(var(--primary))]">QQ号和照片</span>。
              同时，<span className="font-medium text-amber-400">对方也将能查看您的QQ号和照片</span>。资料查看权限是双向的。
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmTarget(null)}
                className="flex-1 rounded-lg border border-[hsl(var(--border))] py-2 text-sm font-medium text-[hsl(var(--muted-foreground))] transition-all hover:bg-[hsl(var(--secondary))]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => sendViewRequest(confirmTarget)}
                className="flex-1 rounded-lg bg-gradient-to-r from-[hsl(262,83%,58%)] to-[hsl(290,70%,55%)] py-2 text-sm font-semibold text-white transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                确认申请
              </button>
            </div>
          </div>
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
