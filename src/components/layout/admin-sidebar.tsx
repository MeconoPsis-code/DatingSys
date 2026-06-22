"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const links = [
  {
    label: "概览",
    href: "/dashboard",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5">
        <path d="M3 13h8V3H3z" />
        <path d="M13 21h8V11h-8z" />
        <path d="M13 3v6h8V3z" />
        <path d="M3 21h8v-6H3z" />
      </svg>
    ),
  },
  {
    label: "用户管理",
    href: "/users",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5">
        <path d="M16 11a4 4 0 1 0-8 0" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </svg>
    ),
  },
  {
    label: "群认证",
    href: "/membership",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5">
        <path d="M12 3l7 4v5c0 5-3 8-7 9-4-1-7-4-7-9V7z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
  },
  {
    label: "举报处理",
    href: "/reports",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5">
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <circle cx="12" cy="17" r="1" style={{ fill: "currentColor", stroke: "none" }} />
      </svg>
    ),
  },
  {
    label: "评分管理",
    href: "/scoring-admin",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5">
        <path d="M4 7h16" />
        <path d="M7 7l1-3h8l1 3" />
        <rect x="5" y="7" width="14" height="13" rx="2" />
        <path d="M9 13h6" />
      </svg>
    ),
  },
  {
    label: "审计日志",
    href: "/audit",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M8 13h8" />
        <path d="M8 17h5" />
      </svg>
    ),
  },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const isActive = (href: string) => {
    const url = new URL(href, "http://localhost");
    const path = url.pathname;

    if (pathname !== path) return false;

    // Check if query params match exactly
    const keys = Array.from(url.searchParams.keys());
    if (keys.length === 0) {
      // Base page is active if no status query param is set
      return !searchParams.get("status");
    }

    return keys.every((key) => searchParams.get(key) === url.searchParams.get(key));
  };

  return (
    <aside className="flex w-[246px] shrink-0 h-screen sticky top-0 flex-col border-r border-[#e9edf5] bg-[#fbfcfe] pb-7 overflow-y-auto">
      {/* Brand area */}
      <div className="side-brand mb-6 flex h-[92px] items-center gap-3 bg-brand-blue rounded-b-[20px] px-[28px] text-white shadow-[0_4px_12px_rgba(22,119,255,0.15)]">
        <div className="flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.06)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/app_icon_dark.png" className="h-[22px] w-auto object-contain" alt="TenMatch Icon" />
        </div>
        <span className="font-outfit text-[22px] font-extrabold tracking-[-0.5px] text-white">
          TenMatch
        </span>
      </div>

      {/* Navigation menu */}
      <nav className="menu flex flex-col gap-2 px-[18px]">
        {links.map((link) => {
          const active = isActive(link.href);
          return (
            <Link
              key={link.label}
              href={link.href}
              className={`menu-item flex h-11 items-center gap-3 rounded-[13px] px-3.5 text-sm font-semibold transition-all duration-200 ${
                active
                  ? "bg-brand-blue text-white shadow-[0_10px_22px_rgba(22,119,255,0.18)]"
                  : "text-brand-muted hover:bg-slate-100 hover:text-brand-text [&_svg]:stroke-brand-muted hover:[&_svg]:stroke-brand-text"
              }`}
            >
              <span className={`shrink-0 [&_svg]:h-5 [&_svg]:w-5 [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-2 [&_svg]:stroke-linecap-round [&_svg]:stroke-linejoin-round`}>
                {link.icon}
              </span>
              {link.label}
            </Link>
          );
        })}
      </nav>

      {/* Sidebar footer */}
      <div className="mt-auto flex flex-col gap-4 px-[18px]">
        <Link
          href="/profile"
          className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs font-medium text-brand-blue transition-colors hover:text-blue-700"
        >
          ← 返回用户端
        </Link>
      </div>
    </aside>
  );
}
