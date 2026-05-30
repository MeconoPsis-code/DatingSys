"use client";

import Link from "next/link";

export function ScorerNav() {
  return (
    <header className="flex h-14 items-center justify-between border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] px-5">
      <span className="text-lg font-bold text-[hsl(var(--foreground))]">
        🎯 评分面板
      </span>
      <div className="flex items-center gap-4">
        <span className="inline-flex items-center rounded-full bg-[hsl(var(--secondary))] px-3 py-1 text-xs font-medium text-[hsl(var(--muted-foreground))]">
          待评分: --
        </span>
        <Link
          href="/profile"
          className="text-xs text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
        >
          ← 返回用户端
        </Link>
      </div>
    </header>
  );
}
