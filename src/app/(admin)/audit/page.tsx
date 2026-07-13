"use client";

import { useState, useEffect, useCallback } from "react";

/* ─── Types ──────────────────────────────────────────── */

interface AuditLogEntry {
  id: string;
  actorUserId: string | null;
  actorNickname: string | null;
  actorQQ: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}

/* ─── Constants ──────────────────────────────────────── */

const ACTION_GROUPS = [
  { label: "全部", value: "" },
  { label: "登录", value: "LOGIN" },
  { label: "资料", value: "PROFILE" },
  { label: "管理操作", value: "ADMIN" },
  { label: "举报", value: "REPORT" },
  { label: "认证", value: "MEMBERSHIP" },
  { label: "评分", value: "RATING" },
  { label: "匹配", value: "MATCH" },
];

const TARGET_TYPES = [
  { label: "全部", value: "" },
  { label: "用户", value: "User" },
  { label: "资料", value: "Profile" },
  { label: "举报", value: "Report" },
  { label: "群认证", value: "GroupMembership" },
];

function formatDateTime(d: string) {
  return new Date(d).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDateInput(d: Date) {
  return d.toISOString().split("T")[0];
}

/* ─── Expandable Row ─────────────────────────────────── */

function LogEntry({
  log,
  expanded,
  onToggle,
}: {
  log: AuditLogEntry;
  expanded: boolean;
  onToggle: () => void;
}) {
  // Color-code by action type
  const actionColor = log.action.startsWith("ADMIN_")
    ? "text-amber-400"
    : log.action.startsWith("REPORT_")
    ? "text-red-400"
    : log.action.startsWith("MEMBERSHIP_")
    ? "text-emerald-400"
    : "text-[hsl(var(--foreground))]";

  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer border-b border-[hsl(var(--border)/0.3)] transition-colors hover:bg-[hsl(var(--secondary)/0.3)]"
      >
        <td className="w-12 px-4 py-3 align-top">
          <span className={`inline-block text-[10px] text-[hsl(var(--muted-foreground))] transition-transform ${expanded ? "rotate-90" : ""}`}>
            ▶
          </span>
        </td>
        <td className="w-[170px] px-4 py-3 align-top font-mono text-[11px] whitespace-nowrap text-[hsl(var(--muted-foreground))]">
          {formatDateTime(log.createdAt)}
        </td>
        <td className={`w-[240px] px-4 py-3 align-top font-mono text-xs font-medium break-all ${actionColor}`}>
          {log.action}
        </td>
        <td className="w-[170px] px-4 py-3 align-top text-xs text-[hsl(var(--muted-foreground))]">
          <span className="block truncate">{log.actorNickname || log.actorQQ || "系统"}</span>
        </td>
        <td className="w-[420px] px-4 py-3 align-top text-xs leading-5 break-all text-[hsl(var(--muted-foreground))]">
          {log.targetType ? `${log.targetType}${log.targetId ? ` · ${log.targetId}` : ""}` : "—"}
        </td>
      </tr>

      {/* Expanded detail */}
      {expanded && (
        <tr className="border-b border-[hsl(var(--border)/0.3)] bg-[hsl(var(--secondary)/0.2)]">
          <td colSpan={5} className="px-4 py-3">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-[hsl(var(--muted-foreground))]">操作ID: </span>
                <span className="font-mono text-[hsl(var(--foreground))]">{log.id}</span>
              </div>
              <div>
                <span className="text-[hsl(var(--muted-foreground))]">操作人ID: </span>
                <span className="font-mono text-[hsl(var(--foreground))]">{log.actorUserId || "—"}</span>
              </div>
              <div>
                <span className="text-[hsl(var(--muted-foreground))]">目标类型: </span>
                <span className="text-[hsl(var(--foreground))]">{log.targetType || "—"}</span>
              </div>
              <div>
                <span className="text-[hsl(var(--muted-foreground))]">目标ID: </span>
                <span className="font-mono text-[hsl(var(--foreground))]">{log.targetId || "—"}</span>
              </div>
              {log.ip && (
                <div>
                  <span className="text-[hsl(var(--muted-foreground))]">IP: </span>
                  <span className="font-mono text-[hsl(var(--foreground))]">{log.ip}</span>
                </div>
              )}
            </div>

            {/* Metadata */}
            {log.metadata && Object.keys(log.metadata).length > 0 && (
              <div className="mt-3">
                <p className="mb-1 text-[11px] font-medium text-[hsl(var(--muted-foreground))]">详细信息:</p>
                <pre className="overflow-x-auto rounded-lg bg-[hsl(var(--secondary))] p-2 font-mono text-[11px] text-[hsl(var(--foreground))]">
                  {JSON.stringify(log.metadata, null, 2)}
                </pre>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

/* ─── Main Page ──────────────────────────────────────── */

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [actionFilter, setActionFilter] = useState("");
  const [targetTypeFilter, setTargetTypeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const pageSize = 30;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (actionFilter) params.set("action", actionFilter);
      if (targetTypeFilter) params.set("targetType", targetTypeFilter);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);

      const res = await fetch(`/api/admin/audit-logs?${params}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || "加载失败");
      }
      const data = await res.json();
      setLogs(data.data || []);
      if (data.pagination) {
        setTotalPages(data.pagination.totalPages);
        setTotal(data.pagination.total);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter, targetTypeFilter, dateFrom, dateTo]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void fetchLogs();
    });

    return () => {
      cancelled = true;
    };
  }, [fetchLogs]);

  const inputCls =
    "rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-3 py-2 text-sm text-[hsl(var(--foreground))] outline-none focus:border-[hsl(var(--primary))]";

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">审计日志</h1>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
        {/* Action filter */}
        <div>
          <label className="mb-1 block text-[11px] text-[hsl(var(--muted-foreground))]">操作类型</label>
          <select
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
            className={inputCls}
          >
            {ACTION_GROUPS.map((g) => (
              <option key={g.value} value={g.value}>{g.label}</option>
            ))}
          </select>
        </div>

        {/* Target type */}
        <div>
          <label className="mb-1 block text-[11px] text-[hsl(var(--muted-foreground))]">目标类型</label>
          <select
            value={targetTypeFilter}
            onChange={(e) => { setTargetTypeFilter(e.target.value); setPage(1); }}
            className={inputCls}
          >
            {TARGET_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* Date range */}
        <div>
          <label className="mb-1 block text-[11px] text-[hsl(var(--muted-foreground))]">起始日期</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            max={dateTo || formatDateInput(new Date())}
            className={inputCls}
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-[hsl(var(--muted-foreground))]">结束日期</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            min={dateFrom}
            max={formatDateInput(new Date())}
            className={inputCls}
          />
        </div>

        {/* Reset */}
        <button
          type="button"
          onClick={() => {
            setActionFilter("");
            setTargetTypeFilter("");
            setDateFrom("");
            setDateTo("");
            setPage(1);
          }}
          className="rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-xs text-[hsl(var(--muted-foreground))] transition-all hover:text-[hsl(var(--foreground))]"
        >
          重置
        </button>

        <span className="ml-auto text-xs text-[hsl(var(--muted-foreground))]">
          共 {total} 条日志
        </span>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-[hsl(0,62%,50%/0.3)] bg-[hsl(0,62%,50%/0.1)] px-4 py-3 text-sm text-[hsl(0,62%,70%)]">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[hsl(var(--primary))] border-t-transparent" />
        </div>
      )}

      {/* Log entries */}
      {!loading && (
        <div className="overflow-x-auto rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] [-webkit-overflow-scrolling:touch]">
          <table className="min-w-[1048px] table-fixed border-collapse text-left">
            <thead>
              <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.3)] text-[11px] font-medium text-[hsl(var(--muted-foreground))]">
                <th className="w-12 px-4 py-2.5" />
                <th className="w-[170px] px-4 py-2.5 whitespace-nowrap">时间</th>
                <th className="w-[240px] px-4 py-2.5 whitespace-nowrap">操作</th>
                <th className="w-[170px] px-4 py-2.5 whitespace-nowrap">操作人</th>
                <th className="w-[420px] px-4 py-2.5 whitespace-nowrap">操作信息</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <LogEntry
                  key={log.id}
                  log={log}
                  expanded={expandedId === log.id}
                  onToggle={() => setExpandedId(expandedId === log.id ? null : log.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty */}
      {!loading && logs.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] py-16">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-brand-muted mb-3 [&_svg]:h-6 [&_svg]:w-6 [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-2 [&_svg]:stroke-linecap-round [&_svg]:stroke-linejoin-round">
            <svg viewBox="0 0 24 24">
              <rect width="16" height="20" x="4" y="2" rx="2" />
              <line x1="8" y1="6" x2="16" y2="6" />
              <line x1="8" y1="10" x2="16" y2="10" />
              <line x1="8" y1="14" x2="13" y2="14" />
            </svg>
          </span>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">暂无日志记录</p>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 py-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="rounded-lg border border-[hsl(var(--border))] px-3 py-1.5 text-sm font-medium text-[hsl(var(--foreground))] transition-all hover:bg-[hsl(var(--secondary))] disabled:opacity-40"
          >
            上一页
          </button>
          <span className="px-3 text-sm text-[hsl(var(--muted-foreground))]">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            className="rounded-lg border border-[hsl(var(--border))] px-3 py-1.5 text-sm font-medium text-[hsl(var(--foreground))] transition-all hover:bg-[hsl(var(--secondary))] disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
