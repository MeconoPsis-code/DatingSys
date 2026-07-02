"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function ScorerNav() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => {
        if (!res.ok && res.status === 401 && !cancelled) {
          router.replace("/login?error=expired");
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [router]);

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
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-3 text-xs font-semibold text-white shadow-[0_8px_18px_rgba(15,23,42,0.12)] backdrop-blur transition-all hover:border-white/35 hover:bg-white/20 active:scale-[0.98]"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>
          <span>返回用户端</span>
        </Link>
      </div>
    </header>
  );
}
