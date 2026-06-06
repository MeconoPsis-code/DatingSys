"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getProvinceName, getCityName } from "@/data/regions";
import { ATTRIBUTE_LABELS } from "@/data/attributes";
import Link from "next/link";
import { usePathname } from "next/navigation";

/* ─── Types ──────────────────────────────────────────── */

interface MutualMatch {
  userId: string;
  qqNumber: string | null;
  nickname: string | null;
  age: number;
  heightCm: number;
  weightKg: number;
  provinceCode: string;
  cityCode: string;
  locationType: string;
  attribute: string;
  customAttribute: string | null;
  mbti: string | null;
  selfIntro: string | null;
  hasPhotos: boolean;
  finalScore: number | null;
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

function getAttrLabel(attr: string, custom?: string | null): string {
  if (attr === "OTHER" && custom) return `其他: ${custom}`;
  return (ATTRIBUTE_LABELS as Record<string, string>)[attr] ?? attr;
}

function getInitial(nickname: string | null): string {
  if (!nickname) return "?";
  return nickname.charAt(0).toUpperCase();
}

const AVATAR_COLORS = [
  "from-[hsl(262,83%,58%)] to-[hsl(290,70%,55%)]",
  "from-[hsl(200,80%,55%)] to-[hsl(220,70%,50%)]",
  "from-[hsl(340,80%,55%)] to-[hsl(10,70%,50%)]",
  "from-[hsl(150,60%,45%)] to-[hsl(170,70%,40%)]",
  "from-[hsl(30,85%,55%)] to-[hsl(50,75%,50%)]",
];

function getAvatarColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) & 0xffffffff;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/* ─── Match Card ─────────────────────────────────────── */

function MutualMatchCard({
  match,
  onCopyQQ,
  photoRequestStatus,
  onRequestPhoto,
}: {
  match: MutualMatch;
  onCopyQQ: (qq: string) => void;
  photoRequestStatus: string | null;
  onRequestPhoto: (userId: string) => void;
}) {
  const [showReport, setShowReport] = useState(false);

  return (
    <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 transition-all hover:border-[hsl(var(--primary)/0.3)]">
      {/* Header: avatar + name + badges */}
      <div className="mb-4 flex items-start gap-3">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${getAvatarColor(match.userId)} text-lg font-bold text-white`}
        >
          {getInitial(match.nickname)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-semibold text-[hsl(var(--foreground))]">
              {match.nickname || "匿名用户"}
            </h3>
            {match.hasPhotos && (
              <span className="shrink-0 rounded-full border border-purple-500/30 bg-purple-500/15 px-2 py-0.5 text-[10px] font-medium text-purple-400">
                📷 有照片
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
            {match.age} 岁 · {getProvinceName(match.provinceCode)} ·{" "}
            {getCityName(match.provinceCode, match.cityCode)}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="mb-4 flex flex-wrap gap-2">
        <span className="rounded-lg bg-[hsl(var(--secondary))] px-2.5 py-1 text-xs text-[hsl(var(--foreground))]">
          📏 {match.heightCm} cm
        </span>
        <span className="rounded-lg bg-[hsl(var(--secondary))] px-2.5 py-1 text-xs text-[hsl(var(--foreground))]">
          ⚖️ {match.weightKg} kg
        </span>
        <span className="rounded-lg bg-[hsl(var(--secondary))] px-2.5 py-1 text-xs text-[hsl(var(--foreground))]">
          {getAttrLabel(match.attribute, match.customAttribute)}
        </span>
        {match.mbti && (
          <span className="rounded-lg bg-[hsl(var(--secondary))] px-2.5 py-1 text-xs text-[hsl(var(--foreground))]">
            {match.mbti}
          </span>
        )}
        {match.finalScore !== null && (
          <span className="rounded-lg border border-amber-500/30 bg-amber-500/15 px-2.5 py-1 text-xs text-amber-400">
            ⭐ {match.finalScore.toFixed(1)}
          </span>
        )}
      </div>

      {/* Self intro */}
      {match.selfIntro && (
        <p className="mb-4 rounded-lg bg-[hsl(var(--secondary)/0.5)] px-3 py-2 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
          {match.selfIntro}
        </p>
      )}

      {/* Photo request button */}
      {match.hasPhotos && (
        <div className="mb-4">
          {photoRequestStatus === "APPROVED" ? (
            <Link
              href={`/matches/${match.userId}`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-all hover:scale-[1.02]"
            >
              ✅ 照片已授权 · 查看完整资料
            </Link>
          ) : photoRequestStatus === "PENDING" ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-[hsl(var(--secondary))] px-3 py-1.5 text-xs text-[hsl(var(--muted-foreground))]">
              ⏳ 照片查看申请待审核
            </span>
          ) : photoRequestStatus === "REJECTED" ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-[hsl(0,60%,50%/0.3)] bg-[hsl(0,60%,50%/0.1)] px-3 py-1.5 text-xs text-[hsl(0,60%,65%)]">
              ❌ 照片申请已被拒绝（7天后可重新申请）
            </span>
          ) : (
            <button
              type="button"
              onClick={() => onRequestPhoto(match.userId)}
              className="rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-1.5 text-xs font-medium text-purple-400 transition-all hover:bg-purple-500/20"
            >
              📷 申请查看照片
            </button>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        {match.qqNumber && (
          <button
            type="button"
            onClick={() => onCopyQQ(match.qqNumber!)}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[hsl(262,83%,58%)] to-[hsl(290,70%,55%)] px-3 py-1.5 text-xs font-medium text-white transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            QQ: {match.qqNumber}
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setShowReport(!showReport)}
          className="rounded-lg border border-[hsl(var(--border))] px-3 py-1.5 text-xs text-[hsl(var(--muted-foreground))] transition-all hover:border-[hsl(0,60%,50%/0.5)] hover:text-[hsl(0,60%,65%)]"
        >
          举报
        </button>
      </div>

      {/* Report section (expandable) */}
      {showReport && (
        <div className="mt-3 rounded-lg border border-[hsl(0,60%,50%/0.2)] bg-[hsl(0,60%,50%/0.05)] p-3">
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            如需举报，请前往
            <Link href="/reports" className="ml-1 text-[hsl(var(--primary))] underline">
              举报页面
            </Link>
            提交详细信息。
          </p>
        </div>
      )}
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────── */

export default function MutualMatchesPage() {
  const [matches, setMatches] = useState<MutualMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scoringPending, setScoringPending] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [copied, setCopied] = useState(false);
  const [viewRequestMap, setViewRequestMap] = useState<Record<string, string>>({});
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);
  const pageSize = 20;
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchMatches = useCallback(async () => {
    setLoading(true);
    setError(null);
    setScoringPending(false);
    try {
      const res = await fetch(
        `/api/matches?type=mutual&page=${page}&pageSize=${pageSize}`
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || "加载失败");
      }
      const data = await res.json();

      // Check scoring pending state
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

  // Load outgoing view requests to track photo approval status
  const fetchViewRequests = useCallback(async () => {
    try {
      const res = await fetch("/api/view-requests?type=outgoing&status=all&pageSize=100");
      if (res.ok) {
        const data = await res.json();
        const map: Record<string, string> = {};
        for (const req of data.data || []) {
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

  function handleCopyQQ(qq: string) {
    navigator.clipboard.writeText(qq).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function handlePageChange(newPage: number) {
    setPage(newPage);
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function sendPhotoRequest(targetUserId: string) {
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
      setConfirmTarget(null);
    }
  }

  return (
    <div ref={scrollRef} className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">匹配结果</h1>

      <MatchTabs />

      {/* Copied toast */}
      {copied && (
        <div className="fixed right-4 top-4 z-50 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white shadow-lg">
          ✅ QQ号已复制
        </div>
      )}

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

      {/* Empty state */}
      {!loading && !scoringPending && !error && matches.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] py-16">
          <div className="mb-3 text-5xl">🔍</div>
          <h2 className="text-base font-semibold text-[hsl(var(--foreground))]">
            暂无双向匹配
          </h2>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            尝试调整偏好条件以获得更多匹配
          </p>
        </div>
      )}

      {/* Match count */}
      {!loading && matches.length > 0 && (
        <div className="text-sm text-[hsl(var(--muted-foreground))]">
          共 {total} 个双向匹配
        </div>
      )}

      {/* Match cards */}
      {!loading && (
        <div className="space-y-4">
          {matches.map((match) => (
            <MutualMatchCard
              key={match.userId}
              match={match}
              onCopyQQ={handleCopyQQ}
              photoRequestStatus={viewRequestMap[match.userId] ?? null}
              onRequestPhoto={(userId) => setConfirmTarget(userId)}
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
            onClick={() => handlePageChange(page - 1)}
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
            onClick={() => handlePageChange(page + 1)}
            className="rounded-lg border border-[hsl(var(--border))] px-3 py-1.5 text-sm font-medium text-[hsl(var(--foreground))] transition-all hover:bg-[hsl(var(--secondary))] disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      )}

      {/* Photo request confirmation modal */}
      {confirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-xl">
            <div className="mb-4 text-center text-3xl">📷</div>
            <h3 className="mb-2 text-center text-base font-semibold text-[hsl(var(--foreground))]">申请查看照片</h3>
            <p className="mb-5 text-center text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
              申请一旦通过，<span className="font-medium text-amber-400">对方也将能查看您的照片</span>。照片查看权限是双向的，仅当双方都有照片档案时生效。
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
                onClick={() => sendPhotoRequest(confirmTarget)}
                className="flex-1 rounded-lg bg-gradient-to-r from-[hsl(262,83%,58%)] to-[hsl(290,70%,55%)] py-2 text-sm font-semibold text-white transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                确认申请
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
