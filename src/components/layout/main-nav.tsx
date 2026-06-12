"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

const userTabs = [
  {
    label: "资料",
    href: "/profile",
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    label: "匹配",
    href: "/matches/mutual",
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
      </svg>
    ),
  },
  {
    label: "申请",
    href: "/requests",
    icon: (
      <svg viewBox="0 0 24 24">
        <rect width="20" height="16" x="2" y="4" rx="2" />
        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
      </svg>
    ),
  },
  {
    label: "我的",
    href: "/me",
    icon: (
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" />
        <path d="M8 14s1.5 2 4 2 4-2 4-2" />
        <circle cx="9" cy="9" r="1" style={{ fill: "currentColor", stroke: "none" }} />
        <circle cx="15" cy="9" r="1" style={{ fill: "currentColor", stroke: "none" }} />
      </svg>
    ),
  },
];

const scorerTab = {
  label: "评分",
  href: "/scoring",
  icon: (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  ),
};

const reviewTab = {
  label: "审核",
  href: "/scoring-review",
  icon: (
    <svg viewBox="0 0 24 24">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 11 2 2 4-4" />
    </svg>
  ),
};

const adminTab = {
  label: "管理",
  href: "/dashboard",
  icon: (
    <svg viewBox="0 0 24 24">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
};

type UserRole = "USER" | "SCORER" | "ADMIN" | "SUPER_ADMIN";

const ROLE_WEIGHT: Record<UserRole, number> = {
  USER: 0,
  SCORER: 1,
  ADMIN: 2,
  SUPER_ADMIN: 3,
};

export function MainNav() {
  const pathname = usePathname();
  const [role, setRole] = useState<UserRole>("USER");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.data?.role) {
          setRole(data.data.role);
        }
      })
      .catch(() => {});
  }, []);

  // Build tabs based on role
  const tabs = [...userTabs];
  // SCORER and ADMIN get the scoring tab; SUPER_ADMIN does NOT score
  if (role === "SCORER" || role === "ADMIN") {
    tabs.push(scorerTab);
  }
  // SUPER_ADMIN gets the review tab
  if (role === "SUPER_ADMIN") {
    tabs.push(reviewTab);
  }
  if (ROLE_WEIGHT[role] >= ROLE_WEIGHT.ADMIN) {
    tabs.push(adminTab);
  }

  const isActive = (href: string) => {
    if (href === "/matches/mutual") {
      return pathname.startsWith("/matches");
    }
    return pathname.startsWith(href);
  };

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-[246px] flex-col border-r border-[#e9edf5] bg-[#fbfcfe] pb-7">
        <div className="side-brand mb-6 flex h-[92px] items-center gap-3 bg-brand-blue rounded-b-[20px] px-[28px] text-white shadow-[0_4px_12px_rgba(22,119,255,0.15)]">
          <div className="flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.06)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/app_icon_dark.png" className="h-[22px] w-auto object-contain" alt="TenMatch Icon" />
          </div>
          <span className="font-outfit text-[22px] font-extrabold tracking-[-0.5px] text-white">
            TenMatch
          </span>
        </div>
        <nav className="menu flex flex-col gap-2 px-[18px]">
          {tabs.map((tab) => {
            const active = isActive(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`menu-item flex h-11 items-center gap-3 rounded-[13px] px-3.5 text-sm font-semibold transition-all duration-200 ${
                  active
                    ? "bg-brand-blue text-white shadow-[0_10px_22px_rgba(22,119,255,0.18)]"
                    : "text-brand-muted hover:bg-slate-100 hover:text-brand-text [&_svg]:stroke-brand-muted hover:[&_svg]:stroke-brand-text"
                }`}
              >
                <span className={`shrink-0 [&_svg]:h-5 [&_svg]:w-5 [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-2 [&_svg]:stroke-linecap-round [&_svg]:stroke-linejoin-round`}>
                  {tab.icon}
                </span>
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Mobile bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-[#e9edf5] bg-white safe-bottom md:hidden">
        {tabs.map((tab) => {
          const active = isActive(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-1 flex-col items-center gap-1 py-2 text-xs font-semibold transition-colors ${
                active
                  ? "text-brand-blue"
                  : "text-brand-muted hover:text-brand-text"
              }`}
            >
              <span className={`shrink-0 [&_svg]:h-5 [&_svg]:w-5 [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-2 [&_svg]:stroke-linecap-round [&_svg]:stroke-linejoin-round`}>
                {tab.icon}
              </span>
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
