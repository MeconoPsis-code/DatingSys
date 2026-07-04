"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { getProvinceName, getCityName } from "@/data/regions";
import { ATTRIBUTE_LABELS } from "@/data/attributes";
import {
  getAvatarColor,
  getInitial,
  getMaskedIdentity,
} from "@/lib/pseudonymous-identity";
import { formatBmi } from "@/lib/bmi";
import { CollapsibleSelfIntro } from "@/components/profile/collapsible-self-intro";
import Link from "next/link";
import { usePathname } from "next/navigation";

/* ─── Types ──────────────────────────────────────────── */

interface MutualMatch {
  userId: string;
  nickname: string | null;
  avatarUrl: string | null;
  identityUnlocked?: boolean;
  age: number;
  heightCm: number;
  weightKg: number;
  provinceCode: string;
  cityCode: string;
  locationType: string;

  attribute: string;
  isSide: boolean;
  isOther: boolean;
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

/* ─── Helpers ────────────────────────────────────────── */

function getAttrLabel(
  attr: string,
  custom?: string | null,
  isSide?: boolean,
  isOther?: boolean,
): string {
  if (attr === "OTHER" && custom) return `其他: ${custom}`;
  let label = (ATTRIBUTE_LABELS as Record<string, string>)[attr] ?? attr;
  const tags: string[] = [];
  if (isSide && attr !== "SIDE") tags.push("side");
  if (isOther && attr !== "OTHER") tags.push("其他");
  if (tags.length > 0) label += `、${tags.join("、")}`;
  return label;
}

function getAttrLabels(
  attr: string,
  custom?: string | null,
  isSide?: boolean,
  isOther?: boolean,
): string[] {
  const labels = [getAttrLabel(attr, custom)];
  if (isSide && attr !== "SIDE") labels.push("side");
  if (isOther && attr !== "OTHER") labels.push("其他");
  return labels;
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

/* ─── Match Card ─────────────────────────────────────── */

function MutualMatchCard({
  match,
  viewRequestStatus,
  onRequestView,
  viewDetail,
  canBypassCooldowns,
}: {
  match: MutualMatch;
  viewRequestStatus: string | null;
  onRequestView: (userId: string) => void;
  viewDetail: { qqNumber: string | null; avatarUrl: string | null } | null;
  canBypassCooldowns: boolean;
}) {
  const [qqCopied, setQqCopied] = useState(false);
  const identityUnlocked =
    match.identityUnlocked === true || viewRequestStatus === "APPROVED";
  const maskedIdentity = getMaskedIdentity(match.userId);
  const unlockedAvatarUrl = identityUnlocked
    ? (match.avatarUrl ?? viewDetail?.avatarUrl ?? null)
    : null;

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
    <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 transition-all hover:border-[hsl(var(--primary)/0.3)] sm:p-5">
      {/* Header: avatar + name + badges */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div
            aria-label={identityUnlocked ? "用户头像" : "随机头像"}
            className={`flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full ${
              unlockedAvatarUrl
                ? "bg-white"
                : `bg-gradient-to-br ${
                    identityUnlocked
                      ? getAvatarColor(match.userId)
                      : maskedIdentity.color
                  } text-lg font-bold text-white`
            }`}
          >
            {unlockedAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={unlockedAvatarUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : identityUnlocked ? (
              getInitial(match.nickname)
            ) : (
              maskedIdentity.letter
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-semibold text-[hsl(var(--foreground))]">
                {identityUnlocked ? (
                  match.nickname || "匿名用户"
                ) : (
                  maskedIdentity.name
                )}
              </h3>
              {match.hasPhotos && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-brand-blue/30 bg-blue-1 px-2 py-0.5 text-[10px] font-medium text-brand-blue">
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
        {viewRequestStatus === "APPROVED" && viewDetail?.qqNumber && (
          <ReportProfileIconLink targetQQ={viewDetail.qqNumber} />
        )}
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
          BMI {formatBmi(match.heightCm, match.weightKg)}
        </span>
        {getAttrLabels(match.attribute, match.customAttribute, match.isSide, match.isOther).map((label) => (
          <span
            key={label}
            className="rounded-lg bg-[hsl(var(--secondary))] px-2.5 py-1 text-xs text-[hsl(var(--foreground))]"
          >
            {label}
          </span>
        ))}
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
      <CollapsibleSelfIntro text={match.selfIntro} className="mb-4" />

      {/* View request / QQ reveal section */}
      <div className="mt-3">
        {viewRequestStatus === "APPROVED" ? (
          <div className="flex flex-col gap-3">
            {/* QQ number revealed */}
            {viewDetail?.qqNumber && (
              <div className="flex w-full flex-col items-start gap-2">
                <button
                  type="button"
                  onClick={() => handleCopyQQ(viewDetail.qqNumber!)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-[#1677ff] to-[#0958d9] px-4 py-2 text-sm font-semibold text-white shadow transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  QQ: {viewDetail.qqNumber}
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2 text-center text-sm font-semibold text-white shadow transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                查看照片与完整资料
              </Link>
            )}
          </div>
        ) : viewRequestStatus === "PENDING_INCOMING" ? (
          <Link
            href="/requests"
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-sm font-semibold text-amber-500 transition-all hover:bg-amber-500/15"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
              <rect width="20" height="16" x="2" y="4" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
            对方已申请查看你 · 去处理
          </Link>
        ) : viewRequestStatus === "PENDING" ? (
          <span className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[hsl(var(--secondary))] px-4 py-2 text-center text-sm font-semibold text-[hsl(var(--muted-foreground))]">
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            资料查看申请待审核
          </span>
        ) : viewRequestStatus === "REJECTED" && !canBypassCooldowns ? (
          <span className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[hsl(0,60%,50%/0.3)] bg-[hsl(0,60%,50%/0.1)] px-4 py-2 text-center text-sm font-semibold text-[hsl(0,60%,65%)]">
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
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
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-brand-blue/30 bg-blue-1 px-4 py-2 text-center text-sm font-semibold text-brand-blue transition-all hover:bg-brand-blue/20"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 9.9-1" />
            </svg>
            {match.currentUserHasPhotos
              ? "申请查看完整资料（QQ号+照片）"
              : "申请查看QQ号"}
          </button>
        )}
      </div>

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
  const [approvedDetails, setApprovedDetails] = useState<Record<string, { qqNumber: string | null; avatarUrl: string | null }>>({});
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);
  const [provinceOnly, setProvinceOnly] = useState(false);
  const [canBypassCooldowns, setCanBypassCooldowns] = useState(false);
  const pageSize = 20;
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchMatches = useCallback(async () => {
    setLoading(true);
    setError(null);
    setScoringPending(false);
    try {
      const res = await fetch(
        `/api/matches?type=mutual&page=${page}&pageSize=${pageSize}&provinceOnly=${provinceOnly ? "true" : "false"}`
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
        setTotal(0);
        setTotalPages(0);
        return;
      }

      // Check preference pending state
      if (data.data?.status === "preference_pending") {
        setPreferencePending(true);
        setScoringPending(false);
        setMatches([]);
        setTotal(0);
        setTotalPages(0);
        return;
      }

      setMatches(data.data || []);
      setCanBypassCooldowns(Boolean(data.canBypassCooldowns));
      if (data.pagination) {
        setTotalPages(data.pagination.totalPages);
        setTotal(data.pagination.total);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [page, provinceOnly]);

  // Load view requests in both directions to track pair-level access/status.
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
              [userId]: {
                qqNumber: data.data.qqNumber,
                avatarUrl: data.data.avatarUrl ?? null,
              },
            }));
          }
        })
        .catch(() => {});
    }
  }, [viewRequestMap, approvedDetails]);

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

  function handlePageChange(newPage: number) {
    setPage(newPage);
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleProvinceFilterChange(enabled: boolean) {
    setProvinceOnly(enabled);
    setPage(1);
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
      setConfirmTarget(null);
    }
  }

  const sortedMatches = useMemo(
    () =>
      [...matches].sort((a, b) => {
        const aApproved =
          a.identityUnlocked === true || viewRequestMap[a.userId] === "APPROVED";
        const bApproved =
          b.identityUnlocked === true || viewRequestMap[b.userId] === "APPROVED";
        if (aApproved !== bApproved) return aApproved ? 1 : -1;
        return b.relevanceScore - a.relevanceScore;
      }),
    [matches, viewRequestMap],
  );
  const hasApprovedMatches = useMemo(
    () =>
      matches.some(
        (match) =>
          match.identityUnlocked === true ||
          viewRequestMap[match.userId] === "APPROVED",
      ),
    [matches, viewRequestMap],
  );

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
      {!loading && !scoringPending && !preferencePending && (matches.length > 0 || total > 0 || provinceOnly) && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-brand-line bg-white/90 p-0.5 shadow-sm">
            <button
              type="button"
              onClick={() => handleProvinceFilterChange(false)}
              className={`rounded-md px-3 py-1 text-xs font-bold transition-all ${
                !provinceOnly
                  ? "bg-white text-brand-text shadow-sm ring-1 ring-brand-line"
                  : "text-brand-muted hover:bg-white hover:text-brand-text"
              }`}
            >
              全部
            </button>
            <button
              type="button"
              onClick={() => handleProvinceFilterChange(true)}
              className={`rounded-md px-3 py-1 text-xs font-bold transition-all ${
                provinceOnly
                  ? "bg-white text-brand-text shadow-sm ring-1 ring-brand-line"
                  : "text-brand-muted hover:bg-white hover:text-brand-text"
              }`}
            >
              同省
            </button>
          </div>
          {hasApprovedMatches && (
            <Link
              href="/requests"
              className="inline-flex items-center rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-brand-blue shadow-sm ring-1 ring-brand-blue/25 transition-all hover:bg-blue-1"
            >
              已通过的资料已置后 · 点击前往申请页
            </Link>
          )}
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
            您的照片正在被评分组审核，评分完成后即可查看匹配结果，预计 48 小时内出分。
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
        <div className="inline-flex w-fit rounded-lg bg-white/85 px-2.5 py-1 text-sm font-semibold text-brand-muted shadow-sm ring-1 ring-brand-line/70">
          共 {total} 个双向匹配
        </div>
      )}

      {/* Match cards */}
      {!loading && (
        <div className="flex flex-col gap-4">
          {sortedMatches.map((match) => (
            <MutualMatchCard
              key={match.userId}
              match={match}
              viewRequestStatus={viewRequestMap[match.userId] ?? null}
              onRequestView={(userId) => setConfirmTarget(userId)}
              viewDetail={approvedDetails[match.userId] ?? null}
              canBypassCooldowns={canBypassCooldowns}
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
          <div className="w-full max-w-sm rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-xl sm:p-6">
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
        );
      })()}
    </div>
  );
}
