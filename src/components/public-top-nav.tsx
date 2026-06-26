"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type PublicNavKey = "home" | "login" | "announcements" | "ranking" | "account";

interface PublicTopNavProps {
  active: Exclude<PublicNavKey, "account">;
  isLoggedIn?: boolean;
}

const NAV_ITEMS: Array<{
  key: PublicNavKey;
  label: string;
  shortLabel?: string;
  href?: string;
}> = [
  { key: "home", label: "主页", href: "/" },
  { key: "announcements", label: "公告", href: "/announcements" },
  { key: "ranking", label: "排行", href: "/ranking" },
];

export function PublicTopNav({
  active,
  isLoggedIn,
}: PublicTopNavProps) {
  const [detectedLoggedIn, setDetectedLoggedIn] = useState(false);

  useEffect(() => {
    if (typeof isLoggedIn === "boolean") {
      return;
    }

    let cancelled = false;
    fetch("/api/auth/me")
      .then((res) => {
        if (!cancelled) setDetectedLoggedIn(res.ok);
      })
      .catch(() => {
        if (!cancelled) setDetectedLoggedIn(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  const clientLoggedIn = isLoggedIn ?? detectedLoggedIn;

  const authNavItem: {
    key: PublicNavKey;
    label: string;
    shortLabel?: string;
    href: string;
  } = clientLoggedIn
    ? { key: "account", label: "我的账号", shortLabel: "我的", href: "/me" }
    : { key: "login", label: "登录", href: "/login" };

  const navItems = [NAV_ITEMS[0], authNavItem, NAV_ITEMS[1], NAV_ITEMS[2]];

  return (
    <nav
      aria-label="公共导航"
      className="fixed left-1/2 top-3 z-50 w-[calc(100%-1rem)] max-w-[680px] -translate-x-1/2 rounded-xl border border-brand-blue/10 bg-[#fafbfe]/90 p-1 shadow-[0_14px_34px_rgba(22,119,255,0.12)] backdrop-blur-xl sm:top-4 sm:w-[calc(100%-2rem)] sm:rounded-2xl sm:p-1.5"
    >
      <div className="flex w-full items-center gap-0.5 sm:gap-1">
        {navItems.map((item) => {
          const isActive = active === item.key;
          const className = `flex-1 truncate rounded-lg px-1.5 py-2 text-center text-[12px] font-semibold leading-none no-underline transition-all sm:rounded-xl sm:px-3 sm:text-sm ${
            isActive
              ? "bg-brand-blue text-white shadow-[0_8px_18px_rgba(22,119,255,0.22)]"
              : item.href
                ? "text-brand-blue hover:bg-brand-blue/8 hover:text-brand-blue"
                : "cursor-not-allowed text-brand-blue/35"
          }`;

          if (!item.href) {
            return (
              <span key={item.key} className={className} aria-disabled="true">
                {item.label}
              </span>
            );
          }

          return (
            <Link key={item.key} href={item.href} className={className}>
              {item.shortLabel ? (
                <>
                  <span className="sm:hidden">{item.shortLabel}</span>
                  <span className="hidden sm:inline">{item.label}</span>
                </>
              ) : (
                item.label
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
