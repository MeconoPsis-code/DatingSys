"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";

type NavAccent = "blue" | "gold";

interface NavTab {
  label: string;
  href: string;
  icon: React.ReactNode;
}

const userTabs: NavTab[] = [
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
    label: "通知",
    href: "/notifications",
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
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

const announcementTab: NavTab = {
  label: "公告",
  href: "/announcements",
  icon: (
    <svg viewBox="0 0 24 24">
      <path d="M4 19.5V4.5A2.5 2.5 0 0 1 6.5 2H20v18H6.5A2.5 2.5 0 0 1 4 17.5" />
      <path d="M8 7h8" />
      <path d="M8 11h6" />
      <path d="M8 15h4" />
    </svg>
  ),
};

const rankingTab: NavTab = {
  label: "排行",
  href: "/ranking",
  icon: (
    <svg viewBox="0 0 24 24">
      <path d="M3 17h18" />
      <path d="M7 17V9" />
      <path d="M12 17V5" />
      <path d="M17 17v-4" />
    </svg>
  ),
};

const scorerTab: NavTab = {
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

const reviewTab: NavTab = {
  label: "审核",
  href: "/scoring-review",
  icon: (
    <svg viewBox="0 0 24 24">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 11 2 2 4-4" />
    </svg>
  ),
};

const adminTab: NavTab = {
  label: "管理",
  href: "/dashboard",
  icon: (
    <svg viewBox="0 0 24 24">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
};

const systemMenuIcon = (
  <svg viewBox="0 0 24 24">
    <circle cx="5" cy="12" r="1.5" />
    <circle cx="12" cy="12" r="1.5" />
    <circle cx="19" cy="12" r="1.5" />
  </svg>
);

type UserRole = "USER" | "SCORER" | "ADMIN" | "SUPER_ADMIN";

const ROLE_WEIGHT: Record<UserRole, number> = {
  USER: 0,
  SCORER: 1,
  ADMIN: 2,
  SUPER_ADMIN: 3,
};

const PRIVILEGED_NAV_HREFS = new Set([
  "/scoring",
  "/scoring-review",
  "/dashboard",
]);

const ACCENT_STYLES: Record<
  NavAccent,
  {
    header: string;
    active: string;
    inactive: string;
    mobileActive: string;
  }
> = {
  blue: {
    header: "text-brand-blue",
    active: "bg-brand-blue text-white shadow-[0_10px_22px_rgba(22,119,255,0.18)]",
    inactive:
      "text-brand-muted hover:bg-brand-blue/10 hover:text-brand-blue [&_svg]:stroke-brand-muted hover:[&_svg]:stroke-brand-blue",
    mobileActive: "text-brand-blue",
  },
  gold: {
    header: "text-[#d48806]",
    active:
      "border border-[#ffe58f] bg-gold-1 text-[#d48806] shadow-[0_10px_22px_rgba(250,173,20,0.16)]",
    inactive:
      "text-brand-muted hover:bg-gold-1 hover:text-[#d48806] [&_svg]:stroke-brand-muted hover:[&_svg]:stroke-[#d48806]",
    mobileActive: "text-[#d48806]",
  },
};

export function MainNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState<UserRole>("USER");
  const [requestBadge, setRequestBadge] = useState(0);
  const [notificationBadge, setNotificationBadge] = useState(0);
  const [reviewBadge, setReviewBadge] = useState(0);
  const [isSystemMenuOpen, setIsSystemMenuOpen] = useState(false);

  const fetchBadges = useCallback(async () => {
    try {
      const reviewRequest =
        role === "SUPER_ADMIN"
          ? fetch("/api/admin/scoring/review-count")
          : Promise.resolve(null);
      const [reqRes, notiRes, reviewRes] = await Promise.all([
        fetch("/api/view-requests?type=incoming&status=pending&pageSize=1"),
        fetch("/api/notifications?pageSize=1"),
        reviewRequest,
      ]);
      if (reqRes.ok) {
        const data = await reqRes.json();
        setRequestBadge(data.pagination?.total ?? 0);
      }
      if (notiRes.ok) {
        const data = await notiRes.json();
        setNotificationBadge(data.data?.unreadCount ?? 0);
      }
      if (reviewRes?.ok) {
        const data = await reviewRes.json();
        setReviewBadge(data.data?.total ?? 0);
      } else if (role !== "SUPER_ADMIN") {
        setReviewBadge(0);
      }
    } catch { /* non-critical */ }
  }, [role]);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) {
          if (r.status === 401 && !cancelled) {
            router.replace("/login?error=expired");
          }
          return null;
        }

        return r.json();
      })
      .then((data) => {
        if (!cancelled && data?.data?.role) {
          setRole(data.data.role);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(hover: none) and (pointer: coarse)");
    const viewport = window.visualViewport;

    if (!viewport || !media.matches) {
      root.style.setProperty("--mobile-nav-lift", "0px");
      return;
    }

    const updateMobileNavLift = () => {
      const activeElement = document.activeElement;
      const isEditing =
        activeElement instanceof HTMLElement &&
        ["INPUT", "SELECT", "TEXTAREA"].includes(activeElement.tagName);

      const bottomInset = Math.max(
        0,
        window.innerHeight - viewport.height - viewport.offsetTop
      );

      const lift =
        !isEditing && bottomInset > 0 && bottomInset < 120
          ? Math.min(Math.round(bottomInset), 56)
          : 0;

      root.style.setProperty("--mobile-nav-lift", `${lift}px`);
    };

    updateMobileNavLift();
    viewport.addEventListener("resize", updateMobileNavLift);
    viewport.addEventListener("scroll", updateMobileNavLift);
    window.addEventListener("orientationchange", updateMobileNavLift);
    window.addEventListener("focusin", updateMobileNavLift);
    window.addEventListener("focusout", updateMobileNavLift);

    return () => {
      viewport.removeEventListener("resize", updateMobileNavLift);
      viewport.removeEventListener("scroll", updateMobileNavLift);
      window.removeEventListener("orientationchange", updateMobileNavLift);
      window.removeEventListener("focusin", updateMobileNavLift);
      window.removeEventListener("focusout", updateMobileNavLift);
      root.style.setProperty("--mobile-nav-lift", "0px");
    };
  }, []);

  // Fetch badge counts on mount and poll every 30s
  useEffect(() => {
    const timer = window.setTimeout(fetchBadges, 0);
    const interval = window.setInterval(fetchBadges, 30000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, [fetchBadges]);

  useEffect(() => {
    if (!isSystemMenuOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsSystemMenuOpen(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSystemMenuOpen]);

  // Refresh badges on navigation
  useEffect(() => {
    const timer = window.setTimeout(fetchBadges, 0);
    return () => window.clearTimeout(timer);
  }, [pathname, fetchBadges]);

  // Build tabs based on role
  const userSection = userTabs;
  const managementSection: NavTab[] = [announcementTab, rankingTab];

  // SCORER and ADMIN get the scoring tab; SUPER_ADMIN does NOT score
  if (role === "SCORER" || role === "ADMIN") {
    managementSection.push(scorerTab);
  }
  // SUPER_ADMIN gets the review tab
  if (role === "SUPER_ADMIN") {
    managementSection.push(reviewTab);
  }
  if (ROLE_WEIGHT[role] >= ROLE_WEIGHT.ADMIN) {
    managementSection.push(adminTab);
  }

  const isActive = (href: string) => {
    if (href === "/matches/mutual") {
      return pathname.startsWith("/matches");
    }
    // Exact match or match with trailing slash/segment to avoid
    // /me matching /membership
    return pathname === href || pathname.startsWith(href + "/");
  };

  const getBadge = (href: string) => {
    if (href === "/requests") return requestBadge;
    if (href === "/notifications") return notificationBadge;
    if (href === "/scoring-review") return reviewBadge;
    return 0;
  };

  const isSystemActive = managementSection.some((tab) => isActive(tab.href));
  const systemBadge = managementSection.reduce(
    (sum, tab) => sum + getBadge(tab.href),
    0
  );

  async function handleNavClick(
    event: React.MouseEvent<HTMLAnchorElement>,
    href: string
  ) {
    if (!PRIVILEGED_NAV_HREFS.has(href)) {
      setIsSystemMenuOpen(false);
      return;
    }

    event.preventDefault();
    setIsSystemMenuOpen(false);

    try {
      await fetch("/api/auth/refresh", {
        method: "POST",
        cache: "no-store",
      });
    } catch {
      // Continue navigation; server-side guards will handle unauthorized users.
    }

    window.location.assign(href);
  }

  const renderDesktopSection = (
    title: string,
    accent: NavAccent,
    sectionTabs: NavTab[]
  ) => {
    const styles = ACCENT_STYLES[accent];

    return (
      <section className="flex flex-col gap-2">
        <div className={`px-2.5 text-sm font-extrabold ${styles.header}`}>
          {title}
        </div>

        {sectionTabs.map((tab) => {
          const active = isActive(tab.href);
          const badge = getBadge(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              onClick={(event) => handleNavClick(event, tab.href)}
              className={`menu-item relative flex h-11 items-center gap-3 rounded-[13px] px-3.5 text-sm font-semibold transition-all duration-200 ${
                active ? styles.active : styles.inactive
              }`}
            >
              <span className="shrink-0 [&_svg]:h-5 [&_svg]:w-5 [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-2 [&_svg]:stroke-linecap-round [&_svg]:stroke-linejoin-round">
                {tab.icon}
              </span>
              {tab.label}
              {badge > 0 && (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-[hsl(0,72%,51%)] px-1 text-[10px] font-bold text-white">
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </Link>
          );
        })}
      </section>
    );
  };

  const renderMobileLink = (tab: NavTab, accent: NavAccent) => {
    const active = isActive(tab.href);
    const badge = getBadge(tab.href);
    const styles = ACCENT_STYLES[accent];

    return (
      <Link
        key={tab.href}
        href={tab.href}
        onClick={(event) => handleNavClick(event, tab.href)}
        className={`relative flex min-w-0 flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-semibold transition-colors min-[360px]:text-[11px] ${
          active ? styles.mobileActive : "text-brand-muted hover:text-brand-text"
        }`}
      >
        <span className="relative shrink-0 [&_svg]:h-5 [&_svg]:w-5 [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-2 [&_svg]:stroke-linecap-round [&_svg]:stroke-linejoin-round">
          {tab.icon}
          {badge > 0 && (
            <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[hsl(0,72%,51%)] px-0.5 text-[9px] font-bold text-white">
              {badge > 99 ? "99+" : badge}
            </span>
          )}
        </span>
        <span className="truncate">{tab.label}</span>
      </Link>
    );
  };

  return (
    <>
      {isSystemMenuOpen && (
        <button
          type="button"
          aria-label="关闭系统菜单"
          className="fixed inset-0 z-40 bg-black/20 md:hidden"
          onClick={() => setIsSystemMenuOpen(false)}
        />
      )}

      {isSystemMenuOpen && (
        <div
          id="mobile-system-menu"
          className="fixed inset-x-3 z-[60] overflow-hidden rounded-2xl border border-[#e9edf5] bg-white shadow-[0_18px_46px_rgba(15,23,42,0.16)] md:hidden"
          style={{
            bottom:
              "calc(4.75rem + env(safe-area-inset-bottom, 0px) + var(--mobile-nav-lift, 0px))",
          }}
        >
          <div className="flex items-center justify-between border-b border-[#eef2f7] px-4 py-3">
            <span className="text-sm font-extrabold text-[#d48806]">系统</span>
            <button
              type="button"
              aria-label="关闭系统菜单"
              className="flex h-8 w-8 items-center justify-center rounded-full text-brand-muted hover:bg-slate-100 hover:text-brand-text"
              onClick={() => setIsSystemMenuOpen(false)}
            >
              ×
            </button>
          </div>
          <div className="grid gap-1 p-2">
            {managementSection.map((tab) => {
              const active = isActive(tab.href);
              const badge = getBadge(tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  onClick={(event) => handleNavClick(event, tab.href)}
                  className={`flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors ${
                    active
                      ? "border border-[#ffe58f] bg-gold-1 text-[#d48806]"
                      : "text-brand-muted hover:bg-gold-1 hover:text-[#d48806]"
                  }`}
                >
                  <span className="shrink-0 [&_svg]:h-5 [&_svg]:w-5 [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-2 [&_svg]:stroke-linecap-round [&_svg]:stroke-linejoin-round">
                    {tab.icon}
                  </span>
                  <span>{tab.label}</span>
                  {badge > 0 && (
                    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-[hsl(0,72%,51%)] px-1 text-[10px] font-bold text-white">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-[246px] shrink-0 h-screen sticky top-0 flex-col border-r border-[#e9edf5] bg-white pb-7 overflow-y-auto">
        <div className="side-brand mb-6 aspect-[1792/877] w-full overflow-hidden bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/information-page-logo.png"
            className="block h-full w-full object-cover object-center"
            alt="TenMatch"
          />
        </div>
        <nav className="menu flex flex-col gap-6 px-[18px]">
          {renderDesktopSection("个人", "blue", userSection)}
          {renderDesktopSection("系统", "gold", managementSection)}
        </nav>
      </aside>

      {/* Mobile bottom tab bar */}
      <nav
        className="fixed left-0 right-0 z-50 grid grid-cols-6 border-t border-[#e9edf5] bg-white px-1 safe-bottom md:hidden"
        style={{ bottom: "var(--mobile-nav-lift, 0px)" }}
      >
        {userSection.map((tab) => renderMobileLink(tab, "blue"))}
        <button
          type="button"
          aria-controls="mobile-system-menu"
          aria-expanded={isSystemMenuOpen}
          onClick={() => setIsSystemMenuOpen((open) => !open)}
          className={`relative flex min-w-0 flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-semibold transition-colors min-[360px]:text-[11px] ${
            isSystemMenuOpen || isSystemActive
              ? ACCENT_STYLES.gold.mobileActive
              : "text-brand-muted hover:text-brand-text"
          }`}
        >
          <span className="relative shrink-0 [&_svg]:h-5 [&_svg]:w-5 [&_svg]:fill-current [&_svg]:stroke-current [&_svg]:stroke-2 [&_svg]:stroke-linecap-round [&_svg]:stroke-linejoin-round">
            {systemMenuIcon}
            {systemBadge > 0 && (
              <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[hsl(0,72%,51%)] px-0.5 text-[9px] font-bold text-white">
                {systemBadge > 99 ? "99+" : systemBadge}
              </span>
            )}
          </span>
          <span className="truncate">系统</span>
        </button>
      </nav>
    </>
  );
}
