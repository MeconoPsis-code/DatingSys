"use client";

import { useState, useEffect, useCallback } from "react";

/* ─── Types ──────────────────────────────────────────── */

interface AdminReport {
  id: string;
  reporterId: string;
  reporterNickname: string | null;
  reporterQQ: string | null;
  targetUserId: string;
  targetNickname: string | null;
  targetQQ: string | null;
  type: string;
  description: string;
  evidence: EvidenceItem[];
  status: string;
  resolution: string | null;
  handledBy: string | null;
  handlerNickname: string | null;
  handledAt: string | null;
  createdAt: string;
}

interface EvidenceItem {
  key: string;
  url: string;
}

/* ─── Constants ──────────────────────────────────────── */

const TYPE_LABELS: Record<string, string> = {
  FAKE_INFO: "虚假信息",
  STOLEN_PHOTO: "盗用照片",
  IMPERSONATION: "冒充他人",
  HARASSMENT: "骚扰行为",
  SCAM: "诈骗行为",
  MALICIOUS: "恶意行为",
  OTHER: "其他",
};

const STATUS_TABS = [
  { value: "", label: "全部" },
  { value: "PENDING", label: "待处理" },
  { value: "REVIEWING", label: "审核中" },
  { value: "ACCEPTED", label: "已采纳" },
  { value: "REJECTED", label: "已驳回" },
];

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-[#fffbe6] text-[#d48806] border-[#ffe58f]",
  REVIEWING: "bg-[#e6f4ff] text-[#0958d9] border-[#91caff]",
  ACCEPTED: "bg-[#f6ffed] text-[#389e0d] border-[#b7eb8f]",
  REJECTED: "bg-[#fff1f0] text-[#cf1322] border-[#ffa39e]",
};

function formatDateTime(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ─── Resolve Modal ──────────────────────────────────── */

function ResolveModal({
  report,
  onClose,
  onSuccess,
}: {
  report: AdminReport;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [verdict, setVerdict] = useState<"accepted" | "rejected" | "">("");
  const [resolution, setResolution] = useState("");
  const [penaltyAction, setPenaltyAction] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const penalties = [
    { value: "", label: "不处罚" },
    { value: "warn", label: "⚠️ 警告" },
    { value: "freeze", label: "🧊 冻结" },
    { value: "ban", label: "🚫 封禁" },
  ];

  async function handleSubmit() {
    if (!verdict) return setErr("请选择处理结果");
    if (!resolution.trim()) return setErr("请填写处理说明");
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/reports/${report.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verdict,
          resolution: resolution.trim(),
          action: penaltyAction || null,
          reason: penaltyAction ? `举报处理: ${resolution.trim()}` : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "处理失败");
      onSuccess();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "处理失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-xl">
        <h3 className="mb-1 text-base font-semibold text-[hsl(var(--foreground))]">处理举报</h3>
        <p className="mb-4 text-xs text-[hsl(var(--muted-foreground))]">
          举报人: {report.reporterNickname || report.reporterQQ} → 被举报: {report.targetNickname || report.targetQQ}
        </p>

        {/* Report details */}
        <div className="mb-4 rounded-lg bg-[hsl(var(--secondary)/0.5)] p-3">
          <p className="text-xs font-medium text-[hsl(var(--foreground))]">
            {TYPE_LABELS[report.type] || report.type}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
            {report.description}
          </p>
          {report.evidence.length > 0 && (
            <div className="mt-3">
              <p className="mb-2 text-[11px] font-medium text-[hsl(var(--foreground))]">
                证据图片 ({report.evidence.length})
              </p>
              <div className="flex flex-wrap gap-2">
                {report.evidence.map((item, index) => (
                  <a
                    key={item.key}
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block h-16 w-20 overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary))]"
                    aria-label={`查看证据图片 ${index + 1}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.url}
                      alt={`证据图片 ${index + 1}`}
                      className="h-full w-full object-cover transition-transform hover:scale-105"
                    />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Verdict */}
        <div className="mb-4">
          <label className="mb-1.5 block text-sm text-[hsl(var(--muted-foreground))]">处理结果</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setVerdict("accepted")}
              className={`rounded-lg border px-4 py-2 text-xs font-medium transition-all ${
                verdict === "accepted"
                  ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-400"
                  : "border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]"
              }`}
            >
              ✅ 采纳举报
            </button>
            <button
              type="button"
              onClick={() => setVerdict("rejected")}
              className={`rounded-lg border px-4 py-2 text-xs font-medium transition-all ${
                verdict === "rejected"
                  ? "border-red-500/50 bg-red-500/15 text-red-400"
                  : "border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]"
              }`}
            >
              ❌ 驳回举报
            </button>
          </div>
        </div>

        {/* Penalty action (only if accepted) */}
        {verdict === "accepted" && (
          <div className="mb-4">
            <label className="mb-1.5 block text-sm text-[hsl(var(--muted-foreground))]">
              对被举报人的处罚
            </label>
            <div className="flex flex-wrap gap-2">
              {penalties.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPenaltyAction(p.value)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                    penaltyAction === p.value
                      ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))]"
                      : "border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Resolution */}
        <div className="mb-4">
          <label className="mb-1.5 block text-sm text-[hsl(var(--muted-foreground))]">处理说明</label>
          <textarea
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            placeholder="请填写处理说明..."
            rows={3}
            className="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-3 py-2 text-sm text-[hsl(var(--foreground))] outline-none focus:border-[hsl(var(--primary))]"
          />
        </div>

        {err && <p className="mb-3 text-xs text-red-400">{err}</p>}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-[hsl(var(--border))] py-2 text-sm font-medium text-[hsl(var(--muted-foreground))] transition-all hover:bg-[hsl(var(--secondary))]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 rounded-lg bg-brand-blue py-2 text-sm font-semibold text-white transition-all hover:scale-[1.02] hover:bg-brand-blue/90 disabled:opacity-50"
          >
            {submitting ? "处理中..." : "确认处理"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────── */

export default function AdminReportsPage() {
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [resolveTarget, setResolveTarget] = useState<AdminReport | null>(null);
  const pageSize = 20;

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (statusFilter) params.set("status", statusFilter);

      const res = await fetch(`/api/admin/reports?${params}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || "加载失败");
      }
      const data = await res.json();
      setReports(data.data || []);
      if (data.pagination) {
        setTotalPages(data.pagination.totalPages);
        setTotal(data.pagination.total);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void fetchReports();
    });

    return () => {
      cancelled = true;
    };
  }, [fetchReports]);

  async function handleOpenResolve(report: AdminReport) {
    if (report.status !== "PENDING") {
      setResolveTarget(report);
      return;
    }

    try {
      const res = await fetch(`/api/admin/reports/${report.id}/review`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "标记审核中失败");

      const reviewingReport = { ...report, status: "REVIEWING" };
      setReports((prev) =>
        prev.map((item) => (item.id === report.id ? reviewingReport : item))
      );
      setResolveTarget(reviewingReport);
    } catch (err) {
      setError(err instanceof Error ? err.message : "标记审核中失败");
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">举报管理</h1>

      {/* Status tabs */}
      <div className="flex flex-wrap gap-1 rounded-xl bg-[hsl(var(--secondary))] p-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => { setStatusFilter(tab.value); setPage(1); }}
            className={`rounded-lg px-4 py-2 text-xs font-medium transition-all ${
              statusFilter === tab.value
                ? "bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-sm"
                : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="text-xs text-[hsl(var(--muted-foreground))]">共 {total} 条举报</div>

      {error && (
        <div className="rounded-lg border border-[hsl(0,62%,50%/0.3)] bg-[hsl(0,62%,50%/0.1)] px-4 py-3 text-sm text-[hsl(0,62%,70%)]">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[hsl(var(--primary))] border-t-transparent" />
        </div>
      )}

      {/* Reports list */}
      {!loading && (
        <div className="space-y-3">
          {reports.map((r) => {
            const statusCls = STATUS_COLORS[r.status] || "";
            const canResolve = r.status === "PENDING" || r.status === "REVIEWING";

            return (
              <div
                key={r.id}
                className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 transition-all hover:border-[hsl(var(--primary)/0.2)]"
              >
                {/* Header */}
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-[hsl(var(--foreground))]">
                        {TYPE_LABELS[r.type] || r.type}
                      </span>
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusCls}`}>
                        {r.status}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-3 text-xs text-[hsl(var(--muted-foreground))]">
                      <span>举报人: {r.reporterNickname || r.reporterQQ || "—"}</span>
                      <span>→ 被举报: {r.targetNickname || r.targetQQ || "—"}</span>
                    </div>
                  </div>
                  <span className="shrink-0 text-[11px] text-[hsl(var(--muted-foreground))]">
                    {formatDateTime(r.createdAt)}
                  </span>
                </div>

                {/* Description */}
                <p className="mb-3 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
                  {r.description}
                </p>

                {r.evidence.length > 0 && (
                  <div className="mb-3">
                    <p className="mb-2 text-[11px] font-medium text-[hsl(var(--foreground))]">
                      证据图片 ({r.evidence.length})
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {r.evidence.map((item, index) => (
                        <a
                          key={item.key}
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="block h-16 w-20 overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary))]"
                          aria-label={`查看证据图片 ${index + 1}`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={item.url}
                            alt={`证据图片 ${index + 1}`}
                            className="h-full w-full object-cover transition-transform hover:scale-105"
                          />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Resolution */}
                {r.resolution && (
                  <div className="mb-3 rounded-lg bg-[hsl(var(--secondary)/0.5)] p-3">
                    <p className="text-[11px] font-medium text-[hsl(var(--foreground))]">
                      处理结果 ({r.handlerNickname || "管理员"}, {formatDateTime(r.handledAt)}):
                    </p>
                    <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">{r.resolution}</p>
                  </div>
                )}

                {/* Action */}
                {canResolve && (
                  <button
                    type="button"
                    onClick={() => void handleOpenResolve(r)}
                    className="rounded-lg bg-brand-blue px-4 py-1.5 text-xs font-semibold text-white transition-all hover:scale-[1.02] hover:bg-brand-blue/90"
                  >
                    处理举报
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Empty */}
      {!loading && reports.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] py-16">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-brand-muted mb-3 [&_svg]:h-6 [&_svg]:w-6 [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-2 [&_svg]:stroke-linecap-round [&_svg]:stroke-linejoin-round">
            <svg viewBox="0 0 24 24">
              <rect width="16" height="20" x="4" y="2" rx="2" />
              <line x1="8" y1="6" x2="16" y2="6" />
              <line x1="8" y1="10" x2="16" y2="10" />
              <line x1="8" y1="14" x2="13" y2="14" />
            </svg>
          </span>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">暂无举报</p>
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

      {/* Resolve Modal */}
      {resolveTarget && (
        <ResolveModal
          report={resolveTarget}
          onClose={() => setResolveTarget(null)}
          onSuccess={() => {
            setResolveTarget(null);
            fetchReports();
          }}
        />
      )}
    </div>
  );
}
