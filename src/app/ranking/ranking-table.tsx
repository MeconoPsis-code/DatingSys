"use client";

import Link from "next/link";
import { useState } from "react";
import type { RankingProfileRequestStatus } from "@/lib/ranking";

interface RankingListEntry {
  rank: number;
  userId: string;
  nickname: string;
  appearanceScore: number;
}

interface RankingTableProps {
  entries: RankingListEntry[];
  isLoggedIn: boolean;
  currentUserHasPhotos: boolean;
  initialRequestStatuses: Record<string, RankingProfileRequestStatus>;
}

function scoreTone(rank: number): string {
  if (rank === 1) {
    return "bg-brand-blue text-white shadow-[0_14px_34px_rgba(22,119,255,0.22)]";
  }
  if (rank <= 3) return "bg-blue-1 text-brand-blue";
  return "bg-slate-100 text-brand-muted";
}

function requestButtonText(status: RankingProfileRequestStatus | undefined): string {
  switch (status) {
    case "APPROVED":
      return "查看资料";
    case "PENDING":
      return "待审核";
    case "PENDING_INCOMING":
      return "待你处理";
    case "REJECTED":
      return "重新申请";
    case "EXPIRED":
    case "CANCELLED":
    case undefined:
      return "申请资料";
    case "SELF":
      return "我的排行";
  }
}

export function RankingTable({
  entries,
  isLoggedIn,
  currentUserHasPhotos,
  initialRequestStatuses,
}: RankingTableProps) {
  const [requestStatuses, setRequestStatuses] =
    useState<Record<string, RankingProfileRequestStatus>>(initialRequestStatuses);
  const [requestingUserId, setRequestingUserId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});

  async function requestProfile(userId: string) {
    setRequestingUserId(userId);
    setMessages((prev) => ({ ...prev, [userId]: "" }));

    try {
      const res = await fetch("/api/view-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: userId }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.error?.code === "DUPLICATE") {
          setRequestStatuses((prev) => ({ ...prev, [userId]: "PENDING" }));
          return;
        }
        if (data.error?.code === "INCOMING_PENDING") {
          setRequestStatuses((prev) => ({ ...prev, [userId]: "PENDING_INCOMING" }));
          return;
        }
        if (data.error?.code === "ALREADY_APPROVED") {
          setRequestStatuses((prev) => ({ ...prev, [userId]: "APPROVED" }));
          return;
        }
        if (res.status === 401) {
          window.location.href = "/login?from=/ranking";
          return;
        }
        throw new Error(data.error?.message || "申请失败");
      }

      setRequestStatuses((prev) => ({ ...prev, [userId]: "PENDING" }));
      setMessages((prev) => ({ ...prev, [userId]: "申请已发送，等待对方处理。" }));
    } catch (err) {
      setMessages((prev) => ({
        ...prev,
        [userId]: err instanceof Error ? err.message : "申请失败",
      }));
    } finally {
      setRequestingUserId(null);
      setConfirmTarget(null);
    }
  }

  return (
    <>
      <section className="rounded-[20px] border border-brand-line bg-white/95 p-3 shadow-[0_18px_48px_rgba(22,119,255,0.08)] sm:rounded-[24px] sm:p-4">
        <div className="grid grid-cols-[52px_minmax(0,1fr)_72px] gap-2 border-b border-brand-line px-2 pb-3 text-center text-[11px] font-bold uppercase tracking-[0.08em] text-brand-subtle sm:grid-cols-[88px_minmax(180px,1fr)_120px_132px] sm:gap-3 sm:px-3 sm:text-xs sm:tracking-[0.14em]">
          <span className="flex items-center justify-center">排名</span>
          <span className="flex items-center justify-center">昵称</span>
          <span className="flex items-center justify-center">颜值分</span>
          <span className="hidden items-center justify-center sm:flex">资料</span>
        </div>

        <div className="divide-y divide-brand-line/70">
          {entries.map((entry) => {
            const status = requestStatuses[entry.userId];
            const isRequesting = requestingUserId === entry.userId;
            const message = messages[entry.userId];

            return (
              <article
                key={entry.userId}
                className="grid grid-cols-[52px_minmax(0,1fr)_72px] items-center gap-2 px-2 py-3 text-center sm:grid-cols-[88px_minmax(180px,1fr)_120px_132px] sm:gap-3 sm:px-3 sm:py-4"
              >
                <div className="flex items-center justify-center">
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-xl text-sm font-extrabold sm:h-10 sm:w-10 sm:rounded-2xl ${scoreTone(entry.rank)}`}
                  >
                    {entry.rank}
                  </span>
                </div>
                <div className="flex min-w-0 items-center justify-center">
                  <p className="truncate text-base font-bold text-brand-text">
                    {entry.nickname}
                  </p>
                </div>
                <div className="flex items-center justify-center">
                  <span className="font-outfit text-xl font-extrabold text-brand-blue sm:text-2xl">
                    {entry.appearanceScore.toFixed(1)}
                  </span>
                </div>
                <div className="col-span-3 flex flex-col items-stretch justify-center gap-1 sm:col-span-1 sm:items-center">
                  {status === "APPROVED" ? (
                    <Link
                      href={`/matches/${entry.userId}`}
                      className="inline-flex h-9 items-center justify-center rounded-xl bg-brand-blue px-3 text-xs font-bold text-white shadow-[0_10px_22px_rgba(22,119,255,0.16)] transition-all hover:scale-[1.02] hover:bg-brand-blue/90 sm:h-8"
                    >
                      {requestButtonText(status)}
                    </Link>
                  ) : status === "SELF" ? (
                    <span className="inline-flex h-9 items-center justify-center rounded-xl bg-blue-1 px-3 text-xs font-bold text-brand-blue sm:h-8">
                      {requestButtonText(status)}
                    </span>
                  ) : !isLoggedIn ? (
                    <Link
                      href="/login?from=/ranking"
                      className="inline-flex h-9 items-center justify-center rounded-xl border border-brand-blue/25 bg-blue-1 px-3 text-xs font-bold text-brand-blue transition-all hover:bg-brand-blue/15 sm:h-8"
                    >
                      登录后申请
                    </Link>
                  ) : status === "PENDING" ? (
                    <span className="inline-flex h-9 items-center justify-center rounded-xl bg-slate-100 px-3 text-xs font-bold text-brand-muted sm:h-8">
                      {requestButtonText(status)}
                    </span>
                  ) : status === "PENDING_INCOMING" ? (
                    <Link
                      href="/requests"
                      className="inline-flex h-9 items-center justify-center rounded-xl border border-amber-400/40 bg-amber-50 px-3 text-xs font-bold text-amber-600 transition-all hover:bg-amber-100 sm:h-8"
                    >
                      {requestButtonText(status)}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      disabled={isRequesting}
                      onClick={() => setConfirmTarget(entry.userId)}
                      className="inline-flex h-9 items-center justify-center rounded-xl border border-brand-blue/25 bg-blue-1 px-3 text-xs font-bold text-brand-blue transition-all hover:bg-brand-blue/15 disabled:cursor-not-allowed disabled:opacity-60 sm:h-8"
                    >
                      {isRequesting ? "申请中..." : requestButtonText(status)}
                    </button>
                  )}

                  {message && (
                    <span
                      className={`text-[10px] ${
                        message.includes("失败") || message.includes("拒绝")
                          ? "text-red-500"
                          : "text-emerald-500"
                      }`}
                    >
                      {message}
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {confirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-xl sm:p-6">
            <div className="mb-4 flex justify-center text-[hsl(var(--primary))]">
              <svg
                viewBox="0 0 24 24"
                className="h-10 w-10 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round"
              >
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
                  申请通过后，您将可以查看对方的
                  <span className="font-medium text-[hsl(var(--primary))]">QQ号和照片</span>。
                  同时，
                  <span className="font-medium text-amber-400">对方也将能查看您的QQ号和照片</span>。
                  资料查看权限是双向的。
                </>
              ) : (
                <>
                  申请通过后，您将可以查看对方的
                  <span className="font-medium text-[hsl(var(--primary))]">QQ号</span>。
                  同时，
                  <span className="font-medium text-amber-400">对方也将能查看您的QQ号</span>。
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
                disabled={requestingUserId === confirmTarget}
                className="flex-1 rounded-lg border border-[hsl(var(--border))] py-2 text-sm font-medium text-[hsl(var(--muted-foreground))] transition-all hover:bg-[hsl(var(--secondary))] disabled:cursor-not-allowed disabled:opacity-60"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => requestProfile(confirmTarget)}
                disabled={requestingUserId === confirmTarget}
                className="flex-1 rounded-lg bg-gradient-to-r from-[#1677ff] to-[#0958d9] py-2 text-sm font-semibold text-white transition-all hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-70 active:scale-[0.98]"
              >
                {requestingUserId === confirmTarget ? "申请中..." : "确认申请"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
