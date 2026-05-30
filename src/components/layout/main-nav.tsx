"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { label: "资料", href: "/profile", icon: "👤" },
  { label: "匹配", href: "/matches/mutual", icon: "💕" },
  { label: "申请", href: "/requests", icon: "📨" },
  { label: "我的", href: "/me", icon: "👋" },
];

export function MainNav() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/matches/mutual") {
      return pathname.startsWith("/matches");
    }
    return pathname.startsWith(href);
  };

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-56 md:flex-col md:border-r md:border-[hsl(var(--border))] md:bg-[hsl(var(--card))]">
        <div className="flex h-14 items-center border-b border-[hsl(var(--border))] px-5">
          <span className="bg-gradient-to-r from-[hsl(262,83%,68%)] to-[hsl(290,70%,65%)] bg-clip-text text-lg font-bold text-transparent">
            Date System
          </span>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive(tab.href)
                  ? "bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]"
                  : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))]"
              }`}
            >
              <span className="text-base">{tab.icon}</span>
              {tab.label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Mobile bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-[hsl(var(--border))] bg-[hsl(var(--card))] safe-bottom md:hidden">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors ${
              isActive(tab.href)
                ? "text-[hsl(var(--primary))]"
                : "text-[hsl(var(--muted-foreground))]"
            }`}
          >
            <span className="text-xl">{tab.icon}</span>
            {tab.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
