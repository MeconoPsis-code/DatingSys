"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { label: "概览", href: "/dashboard", icon: "📊" },
  { label: "用户", href: "/users", icon: "👥" },
  { label: "群认证", href: "/memberships", icon: "✅" },
  { label: "邀请码", href: "/invites", icon: "🎟️" },
  { label: "举报", href: "/reports", icon: "🚨" },
  { label: "日志", href: "/audit", icon: "📋" },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-60 flex-col border-r border-[hsl(var(--border))] bg-[hsl(var(--card))]">
      <div className="flex h-14 items-center border-b border-[hsl(var(--border))] px-5">
        <span className="text-lg font-bold text-[hsl(var(--foreground))]">
          🛡️ 管理后台
        </span>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              pathname.startsWith(link.href)
                ? "bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]"
                : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))]"
            }`}
          >
            <span className="text-base">{link.icon}</span>
            {link.label}
          </Link>
        ))}
      </nav>
      <div className="border-t border-[hsl(var(--border))] p-3">
        <Link
          href="/profile"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
        >
          ← 返回用户端
        </Link>
      </div>
    </aside>
  );
}
