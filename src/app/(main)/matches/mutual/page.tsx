"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getProvinceName, getCityName } from "@/data/regions";
import { ATTRIBUTE_LABELS } from "@/data/attributes";
import Link from "next/link";
import { usePathname } from "next/navigation";

/* ─── Types ──────────────────────────────────────────── */

interface MutualMatch {
  userId: string;
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
  currentUserHasPhotos: boolean;
}

/* ─── Match Tabs ─────────────────────────────────────── */

function MatchTabs() {
  const pathname = usePathname();
  const tabs = [
    {
      label: "双向匹配",
      href: "/matches/mutual",
      icon: (
        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
          <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
        </svg>
      ),
    },
    {
      label: "单向匹配",
      href: "/matches/one-way",
      icon: (
        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
          <rect width="20" height="16" x="2" y="4" rx="2" />
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        </svg>
      ),
    },
  ];

  return (
    <div className="flex gap-1 rounded-xl bg-[hsl(var(--secondary))] p-1">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
            pathname === tab.href
              ? "bg-brand-blue text-white shadow-[0_4px_12px_rgba(22,119,255,0.15)]"
              : "text-brand-muted hover:bg-slate-100/50 hover:text-brand-text"
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
  "from-[#1677ff] to-[#0958d9]",
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
  viewRequestStatus,
  onRequestView,
  viewDetail,
}: {
  match: MutualMatch;
  viewRequestStatus: string | null;
  onRequestView: (userId: string) => void;
  viewDetail: { qqNumber: string | null } | null;
}) {
  const [showReport, setShowReport] = useState(false);
  const [qqCopied, setQqCopied] = useState(false);

  function handleCopyQQ(qq: string) {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(qq).then(() => {
        setQqCopied(true);
        setTimeout(() => setQqCopied(false), 1500);
      }).catch(() => fallbackCopy(qq));
    } else {
      fallbackCopy(qq);
    }
  }

  function fallbackCopy(text: string) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      setQqCopied(true);
      setTimeout(() => setQqCopied(false), 1500);
    } catch { /* ignore */ }
    document.body.removeChild(ta);
  }

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
              <span className="inline-flex items-center gap-1 shrink-0 rounded-full border border-brand-blue/30 bg-blue-1 px-2 py-0.5 text-[10px] font-medium text-brand-blue">
                <svg viewBox="0 0 24 24" className="h-3 w-3 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
                  <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                  <circle cx="12" cy="13" r="3" />
                </svg>
                有照片
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
        <span className="inline-flex items-center gap-1 rounded-lg bg-[hsl(var(--secondary))] px-2.5 py-1 text-xs text-[hsl(var(--foreground))]">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round text-[hsl(var(--muted-foreground))]">
            <path d="M21.3 15.3a2.82 2.82 0 0 1 0 4c-1 1-2.5 1-3.5 0L2.8 4.3a2.82 2.82 0 0 1 0-4c1-1 2.5-1 3.5 0Z" />
            <path d="m5.6 7.2 1.4-1.4" />
            <path d="m8.4 10 1.4-1.4" />
            <path d="m11.2 12.8 1.4-1.4" />
            <path d="m14 15.6 1.4-1.4" />
            <path d="m16.8 18.5 1.4-1.4" />
          </svg>
          {match.heightCm} cm
        </span>
        <span className="inline-flex items-center gap-1 rounded-lg bg-[hsl(var(--secondary))] px-2.5 py-1 text-xs text-[hsl(var(--foreground))]">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round text-[hsl(var(--muted-foreground))]">
            <path d="m16 16 3-8 3 8c-.87.65-2.24 1-3 1s-2.13-.35-3-1Z" />
            <path d="m2 16 3-8 3 8c-.87.65-2.24 1-3 1s-2.13-.35-3-1Z" />
            <path d="M7 21h10" />
            <path d="M12 3v18" />
            <path d="M3 7h18" />
          </svg>
          {match.weightKg} kg
        </span>
        <span className="rounded-lg bg-[hsl(var(--secondary))] px-2.5 py-1 text-xs text-[hsl(var(--foreground))]">
          {getAttrLabel(match.attribute, match.customAttribute)}
        </span>
        {match.mbti && (
          <span className="rounded-lg bg-[hsl(var(--secondary))] px-2.5 py-1 text-xs text-[hsl(var(--foreground))]">
            {match.mbti}
          </span>
        )}

        {match.finalScore !== null && match.currentUserHasPhotos && (
          <span className="inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/15 px-2.5 py-1 text-xs text-amber-400">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-amber-500 stroke-2 stroke-linecap-round stroke-linejoin-round text-amber-500">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            {match.finalScore.toFixed(1)}
          </span>
        )}
      </div>

      {/* Self intro */}
      {match.selfIntro && (
        <p className="mb-4 rounded-lg bg-[hsl(var(--secondary)/0.5)] px-3 py-2 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
          {match.selfIntro}
        </p>
      )}

      {/* View request / QQ reveal section */}
      <div className="mb-4">
        {viewRequestStatus === "APPROVED" ? (
          <div className="space-y-2">
            {/* QQ number revealed */}
            {viewDetail?.qqNumber && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopyQQ(viewDetail.qqNumber!)}
                  className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#1677ff] to-[#0958d9] px-3 py-1.5 text-xs font-medium text-white transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  QQ: {viewDetail.qqNumber}
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
                {qqCopied && (
                  <span className="text-[10px] text-emerald-400">已复制</span>
                )}
              </div>
            )}
            {match.hasPhotos && match.currentUserHasPhotos && (
              <Link
                href={`/matches/${match.userId}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-all hover:scale-[1.02]"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
                  <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                  <circle cx="12" cy="13" r="3" />
                </svg>
                查看照片与完整资料
              </Link>
            )}
          </div>
        ) : viewRequestStatus === "PENDING" ? (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-[hsl(var(--secondary))] px-3 py-1.5 text-xs text-[hsl(var(--muted-foreground))]">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            资料查看申请待审核
          </span>
        ) : viewRequestStatus === "REJECTED" ? (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-[hsl(0,60%,50%/0.3)] bg-[hsl(0,60%,50%/0.1)] px-3 py-1.5 text-xs text-[hsl(0,60%,65%)]">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            申请已被拒绝（7天后可重新申请）
          </span>
        ) : (
          <button
            type="button"
            onClick={() => onRequestView(match.userId)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-brand-blue/30 bg-blue-1 px-3 py-1.5 text-xs font-medium text-brand-blue transition-all hover:bg-brand-blue/20"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 9.9-1" />
            </svg>
            {match.currentUserHasPhotos
              ? "申请查看完整资料（QQ号+照片）"
              : "申请查看QQ号"}
          </button>
        )}
      </div>

      {/* Report */}
      <div className="flex items-center gap-2">
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
            <Link href={`/report?target=${match.userId}`} className="ml-1 text-[hsl(var(--primary))] underline">
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
  const [preferencePending, setPreferencePending] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [viewRequestMap, setViewRequestMap] = useState<Record<string, string>>({});
  const [approvedDetails, setApprovedDetails] = useState<Record<string, { qqNumber: string | null }>>({});
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);
  const [provinceOnly, setProvinceOnly] = useState(false);
  const [currentUserProvinceCode, setCurrentUserProvinceCode] = useState<string | null>(null);
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
        setPreferencePending(false);
        setMatches([]);
        return;
      }

      // Check preference pending state
      if (data.data?.status === "preference_pending") {
        setPreferencePending(true);
        setScoringPending(false);
        setMatches([]);
        return;
      }

      setMatches(data.data || []);
      if (data.currentUserProvinceCode) {
        setCurrentUserProvinceCode(data.currentUserProvinceCode);
      }
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

  // Load outgoing view requests to track approval status
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

  // For approved requests, fetch the target user's QQ from the detail endpoint
  useEffect(() => {
    const approvedUserIds = Object.entries(viewRequestMap)
      .filter(([, status]) => status === "APPROVED")
      .map(([userId]) => userId);

    for (const userId of approvedUserIds) {
      if (approvedDetails[userId]) continue; // already fetched
      fetch(`/api/matches/${userId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.data?.qqNumber !== undefined) {
            setApprovedDetails((prev) => ({
              ...prev,
              [userId]: { qqNumber: data.data.qqNumber },
            }));
          }
        })
        .catch(() => {});
    }
  }, [viewRequestMap, approvedDetails]);

  useEffect(() => {
    fetchMatches();
    fetchViewRequests();
  }, [fetchMatches, fetchViewRequests]);

  function handlePageChange(newPage: number) {
    setPage(newPage);
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function sendViewRequest(targetUserId: string) {
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
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round text-brand-blue">
          <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
        </svg>
        匹配结果
      </h1>

      <MatchTabs />

      {/* Province filter toggle */}
      {!loading && !scoringPending && !preferencePending && matches.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] p-0.5">
            <button
              type="button"
              onClick={() => setProvinceOnly(false)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
                !provinceOnly
                  ? "bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-sm"
                  : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
              }`}
            >
              全部
            </button>
            <button
              type="button"
              onClick={() => setProvinceOnly(true)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
                provinceOnly
                  ? "bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-sm"
                  : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
              }`}
            >
              同省
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2.5 rounded-xl border border-red-100 bg-white px-4 py-3.5 text-sm font-semibold text-red-500 shadow-[0_4px_12px_rgba(0,0,0,0.03)]">
          <svg viewBox="0 0 24 24" strokeWidth="2.5" className="h-5 w-5 shrink-0 fill-none stroke-current stroke-linecap-round stroke-linejoin-round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="13" />
            <circle cx="12" cy="17" r="1.25" fill="currentColor" stroke="none" />
          </svg>
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

      {/* Preference pending */}
      {preferencePending && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] py-16">
          <div className="mb-4 text-5xl">🎯</div>
          <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">
            评分已完成，请设置匹配偏好
          </h2>
          <p className="mt-2 max-w-xs text-center text-sm text-[hsl(var(--muted-foreground))]">
            选择你的匹配方式后即可进入匹配池，查看匹配结果。
          </p>
          <a
            href="/match-preferences"
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#1677ff] to-[#0958d9] px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-blue/20 transition-all hover:scale-[1.02]"
          >
            设置匹配偏好
          </a>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[hsl(var(--primary))] border-t-transparent" />
        </div>
      )}

      {/* Empty state */}
      {!loading && !scoringPending && !preferencePending && !error && matches.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] py-16">
          <div className="mb-3 text-[hsl(var(--muted-foreground))]">
            <svg viewBox="0 0 24 24" className="h-12 w-12 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </div>
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
          {(provinceOnly && currentUserProvinceCode
            ? matches.filter((m) => m.provinceCode === currentUserProvinceCode)
            : matches
          ).map((match) => (
            <MutualMatchCard
              key={match.userId}
              match={match}
              viewRequestStatus={viewRequestMap[match.userId] ?? null}
              onRequestView={(userId) => setConfirmTarget(userId)}
              viewDetail={approvedDetails[match.userId] ?? null}
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

      {/* View request confirmation modal */}
      {confirmTarget && (() => {
        const iHavePhotos = matches[0]?.currentUserHasPhotos ?? false;
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-xl">
            <div className="mb-4 flex justify-center text-[hsl(var(--primary))]">
              <svg viewBox="0 0 24 24" className="h-10 w-10 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 9.9-1" />
              </svg>
            </div>
            <h3 className="mb-2 text-center text-base font-semibold text-[hsl(var(--foreground))]">
              {iHavePhotos ? "申请查看完整资料" : "申请查看QQ号"}
            </h3>
            <p className="mb-5 text-center text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
              {iHavePhotos ? (
                <>
                  申请通过后，您将可以查看对方的<span className="font-medium text-[hsl(var(--primary))]">QQ号和照片</span>。
                  同时，<span className="font-medium text-amber-400">对方也将能查看您的QQ号和照片</span>。资料查看权限是双向的。
                </>
              ) : (
                <>
                  申请通过后，您将可以查看对方的<span className="font-medium text-[hsl(var(--primary))]">QQ号</span>。
                  同时，<span className="font-medium text-amber-400">对方也将能查看您的QQ号</span>。
                  <span className="mt-1 block text-[hsl(var(--muted-foreground))]">
                    注：您没有上传照片，无法查看对方照片和颜值评分。
                  </span>
                </>
              )}
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
                className="flex-1 rounded-lg bg-gradient-to-r from-[#1677ff] to-[#0958d9] py-2 text-sm font-semibold text-white transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                确认申请
              </button>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}
