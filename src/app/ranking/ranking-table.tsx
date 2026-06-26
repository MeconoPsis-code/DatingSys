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
  initialRequestStatuses,
}: RankingTableProps) {
  const [requestStatuses, setRequestStatuses] =
    useState<Record<string, RankingProfileRequestStatus>>(initialRequestStatuses);
  const [requestingUserId, setRequestingUserId] = useState<string | null>(null);
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
    }
  }

  return (
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
                ) : (
                  <button
                    type="button"
                    disabled={isRequesting}
                    onClick={() => requestProfile(entry.userId)}
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
  );
}
