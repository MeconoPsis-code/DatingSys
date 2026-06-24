import Link from "next/link";

type PublicNavKey = "home" | "login" | "announcements" | "ranking";

interface PublicTopNavProps {
  active: PublicNavKey;
}

const NAV_ITEMS: Array<{
  key: PublicNavKey;
  label: string;
  href?: string;
}> = [
  { key: "home", label: "主页", href: "/" },
  { key: "login", label: "登录", href: "/login" },
  { key: "announcements", label: "公告" },
  { key: "ranking", label: "排行" },
];

export function PublicTopNav({ active }: PublicTopNavProps) {
  return (
    <nav
      aria-label="公共导航"
      className="fixed left-1/2 top-4 z-50 w-[calc(100%-2rem)] max-w-[680px] -translate-x-1/2 rounded-2xl border border-brand-blue/10 bg-[#fafbfe]/90 p-1.5 shadow-[0_14px_34px_rgba(22,119,255,0.12)] backdrop-blur-xl"
    >
      <div className="flex w-full items-center gap-1">
        {NAV_ITEMS.map((item) => {
          const isActive = active === item.key;
          const className = `flex-1 rounded-xl px-3 py-2 text-center text-sm font-semibold no-underline transition-all ${
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
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
