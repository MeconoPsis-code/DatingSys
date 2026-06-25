"use client";

import { useState, useEffect, useCallback } from "react";

/* ─── Types ──────────────────────────────────────────── */

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

/* ─── Constants ──────────────────────────────────────── */

const TYPE_ICONS: Record<string, { icon: React.ReactNode; color: string }> = {
  SCORING_COMPLETE: {
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
    color: "bg-amber-500/15 text-amber-500",
  },
  RANKING_INVITE: {
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
        <path d="M3 17h18" />
        <path d="M7 17V9" />
        <path d="M12 17V5" />
        <path d="M17 17v-4" />
      </svg>
    ),
    color: "bg-brand-blue/15 text-brand-blue",
  },
  VIEW_REQUEST_RECEIVED: {
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
        <rect width="20" height="16" x="2" y="4" rx="2" />
        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
      </svg>
    ),
    color: "bg-blue-500/15 text-blue-500",
  },
  VIEW_REQUEST_APPROVED: {
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
    color: "bg-emerald-500/15 text-emerald-500",
  },
  VIEW_REQUEST_REJECTED: {
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    ),
    color: "bg-red-500/15 text-red-500",
  },
  PENALTY_WARNING: {
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
    color: "bg-red-500/15 text-red-500",
  },
  SYSTEM: {
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
    ),
    color: "bg-brand-blue/15 text-brand-blue",
  },
};

function getTypeInfo(type: string) {
  return TYPE_ICONS[type] || TYPE_ICONS.SYSTEM;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin}分钟前`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}小时前`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}天前`;
  return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

const NOTIF_LINK_MAP: Record<string, string> = {
  SCORING_COMPLETE: "/match-preferences",
  RANKING_INVITE: "/me#ranking-setting",
  VIEW_REQUEST_RECEIVED: "/requests",
};

function renderMessage(n: NotificationItem) {
  const link = NOTIF_LINK_MAP[n.type];
  if (!link) return n.message;
  // Split on 「...」 and make matched text a clickable link
  const parts = n.message.split(/(「[^」]+」)/);
  return parts.map((part, i) =>
    /^「.+」$/.test(part) ? (
      <a
        key={i}
        href={link}
        onClick={(e) => e.stopPropagation()}
        className="font-medium text-brand-blue underline decoration-brand-blue/30 underline-offset-2 hover:decoration-brand-blue"
      >
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

/* ─── Component ──────────────────────────────────────── */

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/notifications?pageSize=50");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.data?.notifications || []);
        setUnreadCount(data.data?.unreadCount || 0);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  async function handleMarkAllRead() {
    try {
      await fetch("/api/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: true }),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {
      /* ignore */
    }
  }

  async function handleMarkRead(id: string) {
    try {
      await fetch("/api/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      /* ignore */
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[hsl(var(--primary))] border-t-transparent" />
        <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">加载中...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round text-brand-blue">
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
          系统通知
          {unreadCount > 0 && (
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500 px-2 text-xs font-bold text-white">
              {unreadCount}
            </span>
          )}
        </h1>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            className="rounded-lg border border-[hsl(var(--border))] px-3 py-1.5 text-xs font-medium text-[hsl(var(--muted-foreground))] transition-colors hover:border-brand-blue hover:bg-brand-blue/10 hover:text-brand-blue"
          >
            全部标记已读
          </button>
        )}
      </div>

      {/* Notification list */}
      {notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] py-16">
          <svg viewBox="0 0 24 24" className="h-12 w-12 fill-none stroke-current stroke-[1.5] stroke-linecap-round stroke-linejoin-round text-[hsl(var(--muted-foreground)/0.3)]">
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
          <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">暂无通知</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const typeInfo = getTypeInfo(n.type);
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  if (!n.isRead) handleMarkRead(n.id);
                }}
                className={`flex w-full items-start gap-3.5 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 text-left transition-all hover:shadow-sm ${
                  !n.isRead
                    ? "border-brand-blue/20 bg-[hsl(var(--primary)/0.03)]"
                    : ""
                }`}
              >
                {/* Type icon */}
                <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${typeInfo.color}`}>
                  {typeInfo.icon}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {!n.isRead && (
                      <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-brand-blue" />
                    )}
                    <span className={`text-sm font-semibold ${!n.isRead ? "text-[hsl(var(--foreground))]" : "text-[hsl(var(--muted-foreground))]"}`}>
                      {n.title}
                    </span>
                    <span className="ml-auto shrink-0 text-[11px] text-[hsl(var(--muted-foreground))]">
                      {formatTime(n.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
                    {renderMessage(n)}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
