"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/* ─── Types ──────────────────────────────────────────── */

type MatchDirection = "me_fits_them" | "they_fit_me";

interface ExpectationCheck {
  key: "age" | "height" | "weight" | "attribute";
  label: string;
  matched: boolean;
  expected: string;
}

interface OneWayMatch {
  userId: string;
  ageMatch: boolean;
  heightMatch: boolean;
  weightMatch: boolean;
  attributeMatch: boolean;
  hasPhotos: boolean;
  provinceCode: string;
  direction: MatchDirection;
  directionLabel: string;
  targetAgainstMyExpectations: ExpectationCheck[];
  meAgainstTargetExpectations: ExpectationCheck[];
  relevanceScore: number;
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
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-all sm:px-4 sm:text-sm ${
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

/* ─── Match Indicator ────────────────────────────────── */

function MatchBadge({ icon, label, match }: { icon: React.ReactNode; label: string; match: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium ${
        match
          ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
          : "border border-[hsl(0,60%,50%/0.3)] bg-[hsl(0,60%,50%/0.08)] text-[hsl(0,60%,65%)]"
      }`}
    >
      {icon} <span>{label} {match ? "符合" : "不符合"}</span>
    </span>
  );
}

function requestStatusPriority(status: string): number {
  switch (status) {
    case "APPROVED":
      return 5;
    case "PENDING":
    case "PENDING_INCOMING":
      return 4;
    case "REJECTED":
      return 3;
    case "EXPIRED":
    case "CANCELLED":
      return 2;
    default:
      return 1;
  }
}

function setBestRequestStatus(
  map: Record<string, string>,
  userId: string,
  status: string
) {
  const current = map[userId];
  if (!current || requestStatusPriority(status) > requestStatusPriority(current)) {
    map[userId] = status;
  }
}

function getCheckIcon(key: ExpectationCheck["key"]) {
  switch (key) {
    case "age":
      return (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
          <path d="M8 14h.01" />
          <path d="M12 14h.01" />
          <path d="M16 14h.01" />
        </svg>
      );
    case "height":
      return (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
          <path d="M21.3 15.3a2.82 2.82 0 0 1 0 4c-1 1-2.5 1-3.5 0L2.8 4.3a2.82 2.82 0 0 1 0-4c1-1 2.5-1 3.5 0Z" />
          <path d="m5.6 7.2 1.4-1.4" />
          <path d="m8.4 10 1.4-1.4" />
          <path d="m11.2 12.8 1.4-1.4" />
          <path d="m14 15.6 1.4-1.4" />
        </svg>
      );
    case "weight":
      return (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
          <path d="m16 16 3-8 3 8c-.87.65-2.24 1-3 1s-2.13-.35-3-1Z" />
          <path d="m2 16 3-8 3 8c-.87.65-2.24 1-3 1s-2.13-.35-3-1Z" />
          <path d="M7 21h10" />
          <path d="M12 3v18" />
          <path d="M3 7h18" />
        </svg>
      );
    case "attribute":
      return (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
          <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
        </svg>
      );
  }
}

function ExpectationCheckRow({ check }: { check: ExpectationCheck }) {
  return (
    <div
      className={`flex flex-col gap-2 rounded-lg border px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between sm:gap-3 ${
        check.matched
          ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
          : "border-[hsl(0,60%,50%/0.28)] bg-[hsl(0,60%,50%/0.08)] text-[hsl(0,60%,65%)]"
      }`}
    >
      <span className="flex min-w-0 items-center gap-2 font-medium">
        {getCheckIcon(check.key)}
        <span>{check.label}</span>
      </span>
      <span className="min-w-0 text-left sm:text-right">
        <span className="block font-semibold">{check.matched ? "符合" : "不符合"}</span>
        <span className="block truncate text-[10px] opacity-80">
          期望 {check.expected}
        </span>
      </span>
    </div>
  );
}

function ExpectationSection({
  title,
  description,
  checks,
}: {
  title: string;
  description: string;
  checks: ExpectationCheck[];
}) {
  const matchedCount = checks.filter((check) => check.matched).length;
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.45)] p-3">
      <button
        type="button"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded((expanded) => !expanded)}
        className="flex w-full items-center justify-between gap-3 rounded-lg text-left transition-colors hover:text-[hsl(var(--primary))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2"
      >
        <span className="text-sm font-semibold text-[hsl(var(--foreground))]">
          {title}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-medium text-[hsl(var(--muted-foreground))]">
          {matchedCount}/{checks.length} 项符合
          <svg
            viewBox="0 0 24 24"
            className={`h-3 w-3 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round transition-transform ${
              isExpanded ? "rotate-180" : ""
            }`}
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>
      <p
        hidden={!isExpanded}
        className="mb-3 mt-1.5 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]"
      >
        {description}
      </p>
      <div hidden={!isExpanded} className="grid gap-2 sm:grid-cols-2">
        {checks.map((check) => (
          <ExpectationCheckRow key={check.key} check={check} />
        ))}
      </div>
    </div>
  );
}

/* ─── One-Way Match Card ─────────────────────────────── */

function OneWayMatchCard({
  match,
  onRequestView,
  viewRequestStatus,
  currentUserHasPhotos,
  viewDetail,
}: {
  match: OneWayMatch;
  onRequestView: (userId: string) => void;
  viewRequestStatus: string | null;
  currentUserHasPhotos: boolean;
  viewDetail: { qqNumber: string | null } | null;
}) {
  const isMeFitsThem = match.direction === "me_fits_them";
  const directionLabel = isMeFitsThem ? "我符合他" : "他符合我";
  const oneWayReasonChecks = (
    isMeFitsThem
      ? match.targetAgainstMyExpectations
      : match.meAgainstTargetExpectations
  ).filter((check) => !check.matched);

  return (
    <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 transition-all hover:border-[hsl(var(--primary)/0.3)] sm:p-5">
      {/* Direction badge */}
      <div className="mb-3 flex flex-col items-start gap-2 sm:flex-row sm:items-center">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${
            isMeFitsThem
              ? "border border-blue-500/30 bg-blue-500/15 text-blue-400"
              : "border border-emerald-500/30 bg-emerald-500/15 text-emerald-400"
          }`}
        >
          {directionLabel}
        </span>
        <span className="text-[10px] leading-snug text-[hsl(var(--muted-foreground))]">
          {oneWayReasonChecks.length > 0
            ? `单向原因：${oneWayReasonChecks.map((check) => check.label).join("、")}`
            : "单向条件已展示"}
        </span>
      </div>

      {/* Match indicator badges */}
      <div className="mb-4 flex flex-wrap gap-2">
        <MatchBadge
          icon={
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
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
          }
          label="年龄"
          match={match.ageMatch}
        />
        <MatchBadge
          icon={
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
              <path d="M21.3 15.3a2.82 2.82 0 0 1 0 4c-1 1-2.5 1-3.5 0L2.8 4.3a2.82 2.82 0 0 1 0-4c1-1 2.5-1 3.5 0Z" />
              <path d="m5.6 7.2 1.4-1.4" />
              <path d="m8.4 10 1.4-1.4" />
              <path d="m11.2 12.8 1.4-1.4" />
              <path d="m14 15.6 1.4-1.4" />
              <path d="m16.8 18.5 1.4-1.4" />
            </svg>
          }
          label="身高"
          match={match.heightMatch}
        />
        <MatchBadge
          icon={
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
              <path d="m16 16 3-8 3 8c-.87.65-2.24 1-3 1s-2.13-.35-3-1Z" />
              <path d="m2 16 3-8 3 8c-.87.65-2.24 1-3 1s-2.13-.35-3-1Z" />
              <path d="M7 21h10" />
              <path d="M12 3v18" />
              <path d="M3 7h18" />
            </svg>
          }
          label="体重"
          match={match.weightMatch}
        />

        <MatchBadge
          icon={
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
              <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
            </svg>
          }
          label="属性"
          match={match.attributeMatch}
        />
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

      <div className="mb-4 space-y-3">
        <ExpectationSection
          title="他是否符合我"
          description={
            isMeFitsThem
              ? "对方没有完全符合我的期待，红色项目就是造成单向匹配的原因。"
              : "对方符合我的全部期待，因此这边是完整通过。"
          }
          checks={match.targetAgainstMyExpectations}
        />
        <ExpectationSection
          title="我是否符合他"
          description={
            isMeFitsThem
              ? "我符合对方的全部期待，因此对方能看到我符合他。"
              : "我没有完全符合对方的期待，所以这次不是双向匹配。"
          }
          checks={match.meAgainstTargetExpectations}
        />
      </div>

      {/* Action */}
      <div>
        {viewRequestStatus === "PENDING_INCOMING" && (
          <Link
            href="/requests"
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-center text-xs font-medium text-amber-500 transition-all hover:bg-amber-500/15 sm:inline-flex sm:w-auto sm:py-1.5"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
              <rect width="20" height="16" x="2" y="4" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
            对方已申请查看你 · 去处理
          </Link>
        )}
        {viewRequestStatus === "PENDING" && (
          <span className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[hsl(var(--secondary))] px-3 py-2 text-center text-xs text-[hsl(var(--muted-foreground))] sm:inline-flex sm:w-auto sm:py-1.5">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            资料查看申请待审核
          </span>
        )}
        {viewRequestStatus === "APPROVED" && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Link
              href={`/matches/${match.userId}`}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 px-3 py-2 text-center text-xs font-medium text-white transition-all hover:scale-[1.02] sm:inline-flex sm:w-auto sm:py-1.5"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              已通过 · 查看完整资料
            </Link>
            {viewDetail?.qqNumber && (
              <Link
                href={`/report?targetQQ=${encodeURIComponent(viewDetail.qqNumber)}`}
                className="flex w-full items-center justify-center rounded-lg bg-red-500 px-3 py-2 text-xs font-semibold text-white shadow-sm shadow-red-500/20 transition-all hover:bg-red-600 active:scale-[0.98] sm:w-auto sm:py-1.5"
              >
                举报
              </Link>
            )}
          </div>
        )}
        {viewRequestStatus === "REJECTED" && (
          <span className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[hsl(0,60%,50%/0.3)] bg-[hsl(0,60%,50%/0.1)] px-3 py-2 text-center text-xs text-[hsl(0,60%,65%)] sm:inline-flex sm:w-auto sm:py-1.5">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            申请已被拒绝
          </span>
        )}
        {viewRequestStatus === null && (
          <button
            type="button"
            onClick={() => onRequestView(match.userId)}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-[#1677ff] to-[#0958d9] px-4 py-2 text-center text-xs font-semibold text-white shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98] sm:inline-flex sm:w-auto"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 9.9-1" />
            </svg>
            {currentUserHasPhotos && match.hasPhotos
              ? "申请查看完整资料"
              : "申请查看QQ号"}
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
  const [approvedDetails, setApprovedDetails] = useState<Record<string, { qqNumber: string | null }>>({});
  const [requesting, setRequesting] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | MatchDirection>("all");
  const [provinceOnly, setProvinceOnly] = useState(false);
  const [currentUserProvinceCode, setCurrentUserProvinceCode] = useState<string | null>(null);
  const [currentUserHasPhotos, setCurrentUserHasPhotos] = useState(false);
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
      if (data.currentUserProvinceCode) {
        setCurrentUserProvinceCode(data.currentUserProvinceCode);
      }
      if (data.currentUserHasPhotos !== undefined) {
        setCurrentUserHasPhotos(data.currentUserHasPhotos);
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

  // Load existing view requests in both directions to track pair-level status.
  const fetchViewRequests = useCallback(async () => {
    try {
      const [outRes, inRes] = await Promise.all([
        fetch("/api/view-requests?type=outgoing&status=all&pageSize=100"),
        fetch("/api/view-requests?type=incoming&status=all&pageSize=100"),
      ]);

      const map: Record<string, string> = {};

      if (outRes.ok) {
        const outData = await outRes.json();
        for (const req of outData.data || []) {
          setBestRequestStatus(map, req.targetUserId, req.status);
        }
      }

      if (inRes.ok) {
        const inData = await inRes.json();
        for (const req of inData.data || []) {
          if (req.status === "APPROVED") {
            setBestRequestStatus(map, req.requesterId, "APPROVED");
          } else if (req.status === "PENDING") {
            setBestRequestStatus(map, req.requesterId, "PENDING_INCOMING");
          }
        }
      }

      setViewRequestMap(map);
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      void fetchMatches();
      void fetchViewRequests();
    });
    return () => {
      cancelled = true;
    };
  }, [fetchMatches, fetchViewRequests]);

  useEffect(() => {
    const approvedUserIds = Object.entries(viewRequestMap)
      .filter(([, status]) => status === "APPROVED")
      .map(([userId]) => userId);

    for (const userId of approvedUserIds) {
      if (approvedDetails[userId]) continue;
      fetch(`/api/matches/${userId}`)
        .then((res) => (res.ok ? res.json() : null))
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
        const code = data.error?.code;
        if (code === "ALREADY_APPROVED" || code === "INCOMING_PENDING" || code === "DUPLICATE") {
          setViewRequestMap((prev) => ({
            ...prev,
            [targetUserId]:
              code === "ALREADY_APPROVED"
                ? "APPROVED"
                : code === "INCOMING_PENDING"
                  ? "PENDING_INCOMING"
                  : "PENDING",
          }));
        }
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

  const dirFiltered =
    filter === "all"
      ? matches
      : matches.filter((m) => m.direction === filter);

  const filteredMatches = provinceOnly && currentUserProvinceCode
    ? dirFiltered.filter((m) => m.provinceCode === currentUserProvinceCode)
    : dirFiltered;

  const meFitsThemCount = matches.filter((m) => m.direction === "me_fits_them").length;
  const theyFitMeCount = matches.filter((m) => m.direction === "they_fit_me").length;

  return (
    <div ref={scrollRef} className="flex flex-col gap-5">
      <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
        <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round text-brand-blue">
          <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
        </svg>
        匹配结果
      </h1>

      <MatchTabs />

      {/* Province filter toggle */}
      {!loading && !scoringPending && matches.length > 0 && (
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

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[hsl(var(--primary))] border-t-transparent" />
        </div>
      )}

      {/* Direction filter */}
      {!loading && !scoringPending && matches.length > 0 && (
        <div className="flex flex-wrap gap-2">
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
            onClick={() => setFilter("me_fits_them")}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              filter === "me_fits_them"
                ? "bg-blue-500/15 text-blue-400"
                : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            }`}
          >
            我符合他 ({meFitsThemCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter("they_fit_me")}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              filter === "they_fit_me"
                ? "bg-emerald-500/15 text-emerald-400"
                : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            }`}
          >
            他符合我 ({theyFitMeCount})
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !scoringPending && !error && matches.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] py-16">
          <div className="mb-3 text-[hsl(var(--muted-foreground))]">
            <svg viewBox="0 0 24 24" className="h-12 w-12 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
              <rect width="20" height="16" x="2" y="4" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
          </div>
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
        <div className="flex flex-col gap-4">
          {filteredMatches.map((match) => (
            <OneWayMatchCard
              key={match.userId}
              match={match}
              onRequestView={(userId) => setConfirmTarget(userId)}
              viewRequestStatus={viewRequestMap[match.userId] ?? null}
              currentUserHasPhotos={currentUserHasPhotos}
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
          <div className="w-full max-w-sm rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-xl sm:p-6">
            <div className="mb-4 flex justify-center text-[hsl(var(--primary))]">
              <svg viewBox="0 0 24 24" className="h-10 w-10 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 9.9-1" />
              </svg>
            </div>
            <h3 className="mb-2 text-center text-base font-semibold text-[hsl(var(--foreground))]">
              {currentUserHasPhotos ? "申请查看完整资料" : "申请查看QQ号"}
            </h3>
            <p className="mb-5 text-center text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
              {currentUserHasPhotos ? (
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
            <div className="flex flex-col gap-3 sm:flex-row">
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
