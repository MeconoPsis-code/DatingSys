"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

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
    label: "公告管理",
    href: "/announcements-admin",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5">
        <path d="M4 19.5V4.5A2.5 2.5 0 0 1 6.5 2H20v18H6.5A2.5 2.5 0 0 1 4 17.5" />
        <path d="M8 7h8" />
        <path d="M8 11h6" />
        <path d="M8 15h4" />
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
    label: "评分排班",
    href: "/scorer-schedule",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5">
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M8 2v4" />
        <path d="M16 2v4" />
        <path d="M3 10h18" />
        <path d="m8 15 2 2 4-4" />
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

type AdminNavLink = (typeof links)[number];

const mobilePrimaryHrefs = ["/dashboard", "/users", "/scoring-admin", "/reports"];

const mobilePrimaryLinks = mobilePrimaryHrefs
  .map((href) => links.find((link) => link.href === href))
  .filter((link): link is AdminNavLink => Boolean(link));

const mobileMoreLinks = links.filter((link) => !mobilePrimaryHrefs.includes(link.href));

const moreIcon = (
  <svg viewBox="0 0 24 24" className="h-5 w-5">
    <circle cx="5" cy="12" r="1.5" />
    <circle cx="12" cy="12" r="1.5" />
    <circle cx="19" cy="12" r="1.5" />
  </svg>
);

const returnToUserIcon = (
  <svg viewBox="0 0 24 24" className="h-5 w-5">
    <path d="M19 12H5" />
    <path d="m12 19-7-7 7-7" />
  </svg>
);

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isMoreOpen, setIsMoreOpen] = useState(false);

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

  useEffect(() => {
    if (!isMoreOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsMoreOpen(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMoreOpen]);

  const isMoreActive = mobileMoreLinks.some((link) => isActive(link.href));

  const renderMobileLink = (link: AdminNavLink) => {
    const active = isActive(link.href);

    return (
      <Link
        key={link.label}
        href={link.href}
        onClick={() => setIsMoreOpen(false)}
        className={`relative flex min-w-0 flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-semibold transition-colors min-[360px]:text-[11px] ${
          active ? "text-brand-blue" : "text-brand-muted hover:text-brand-text"
        }`}
      >
        <span className="shrink-0 [&_svg]:h-5 [&_svg]:w-5 [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-2 [&_svg]:stroke-linecap-round [&_svg]:stroke-linejoin-round">
          {link.icon}
        </span>
        <span className="truncate">{link.label}</span>
      </Link>
    );
  };

  return (
    <>
    {isMoreOpen && (
      <button
        type="button"
        aria-label="关闭更多菜单"
        className="fixed inset-0 z-40 bg-black/20 md:hidden"
        onClick={() => setIsMoreOpen(false)}
      />
    )}

    {isMoreOpen && (
      <div
        id="admin-mobile-more-menu"
        className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[60] overflow-hidden rounded-2xl border border-[#e9edf5] bg-white shadow-[0_18px_46px_rgba(15,23,42,0.16)] md:hidden"
      >
        <div className="flex items-center justify-between border-b border-[#eef2f7] px-4 py-3">
          <span className="text-sm font-extrabold text-brand-blue">更多</span>
          <button
            type="button"
            aria-label="关闭更多菜单"
            className="flex h-8 w-8 items-center justify-center rounded-full text-brand-muted hover:bg-slate-100 hover:text-brand-text"
            onClick={() => setIsMoreOpen(false)}
          >
            ×
          </button>
        </div>
        <div className="grid gap-1 p-2">
          {mobileMoreLinks.map((link) => {
            const active = isActive(link.href);
            return (
              <Link
                key={link.label}
                href={link.href}
                onClick={() => setIsMoreOpen(false)}
                className={`flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors ${
                  active
                    ? "border border-brand-blue/20 bg-blue-1 text-brand-blue"
                    : "text-brand-muted hover:bg-blue-1 hover:text-brand-blue"
                }`}
              >
                <span className="shrink-0 [&_svg]:h-5 [&_svg]:w-5 [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-2 [&_svg]:stroke-linecap-round [&_svg]:stroke-linejoin-round">
                  {link.icon}
                </span>
                {link.label}
              </Link>
            );
          })}
        </div>
        <div className="border-t border-[#eef2f7] p-2">
          <Link
            href="/profile"
            onClick={() => setIsMoreOpen(false)}
            className="flex h-11 items-center gap-3 rounded-xl bg-blue-1 px-3 text-sm font-extrabold text-brand-blue transition-colors hover:bg-blue-2"
          >
            <span className="shrink-0 [&_svg]:h-5 [&_svg]:w-5 [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-2 [&_svg]:stroke-linecap-round [&_svg]:stroke-linejoin-round">
              {returnToUserIcon}
            </span>
            返回用户端
          </Link>
        </div>
      </div>
    )}

    <aside className="hidden w-[246px] shrink-0 h-screen sticky top-0 flex-col border-r border-[#e9edf5] bg-white pb-7 overflow-y-auto md:flex">
      {/* Brand area */}
      <div className="side-brand mb-6 aspect-[1792/877] w-full overflow-hidden bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/information-page-logo.png"
          className="block h-full w-full object-cover object-center"
          alt="TenMatch"
        />
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
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-brand-blue/15 bg-blue-1 px-3 text-sm font-semibold text-brand-blue shadow-[0_8px_18px_rgba(22,119,255,0.08)] transition-all hover:border-brand-blue/25 hover:bg-blue-2 hover:shadow-[0_10px_22px_rgba(22,119,255,0.12)] active:scale-[0.98]"
        >
          <span className="shrink-0 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-2 [&_svg]:stroke-linecap-round [&_svg]:stroke-linejoin-round">
            {returnToUserIcon}
          </span>
          返回用户端
        </Link>
      </div>
    </aside>

    <nav className="fixed bottom-0 left-0 right-0 z-50 grid grid-cols-5 border-t border-[#e9edf5] bg-white px-1 safe-bottom md:hidden">
      {mobilePrimaryLinks.map(renderMobileLink)}
      <button
        type="button"
        aria-controls="admin-mobile-more-menu"
        aria-expanded={isMoreOpen}
        onClick={() => setIsMoreOpen((open) => !open)}
        className={`relative flex min-w-0 flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-semibold transition-colors min-[360px]:text-[11px] ${
          isMoreOpen || isMoreActive
            ? "text-brand-blue"
            : "text-brand-muted hover:text-brand-text"
        }`}
      >
        <span className="shrink-0 [&_svg]:h-5 [&_svg]:w-5 [&_svg]:fill-current [&_svg]:stroke-current [&_svg]:stroke-2 [&_svg]:stroke-linecap-round [&_svg]:stroke-linejoin-round">
          {moreIcon}
        </span>
        <span className="truncate">更多</span>
      </button>
    </nav>
    </>
  );
}
