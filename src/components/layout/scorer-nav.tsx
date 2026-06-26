"use client";

import Link from "next/link";

export function ScorerNav() {
  return (
    <header className="sticky top-0 z-40 flex min-h-14 flex-wrap items-center justify-between gap-2 border-b border-blue-600/10 bg-gradient-to-r from-[#1677ff] to-[#0958d9] px-4 py-2 text-white shadow-sm sm:px-5">
      <span className="flex items-center gap-2 text-lg font-bold text-white">
        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-white stroke-2 stroke-linecap-round stroke-linejoin-round shrink-0">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="2" />
        </svg>
        评分面板
      </span>
      <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-4">
        <span className="inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white/95">
          待评分: --
        </span>
        <Link
          href="/profile"
          className="text-xs font-semibold text-white/80 transition-colors hover:text-white"
        >
          ← 返回用户端
        </Link>
      </div>
    </header>
  );
}
