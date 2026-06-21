"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";

/* ─── Types ──────────────────────────────────────────── */

interface MyReport {
  id: string;
  targetUserId: string;
  targetNickname: string | null;
  targetQQ: string | null;
  type: string;
  description: string;
  status: string;
  resolution: string | null;
  createdAt: string;
  handledAt: string | null;
}

/* ─── Constants ──────────────────────────────────────── */

const REPORT_TYPES: { value: string; label: string }[] = [
  { value: "FAKE_INFO", label: "虚假信息" },
  { value: "STOLEN_PHOTO", label: "盗用照片" },
  { value: "IMPERSONATION", label: "冒充他人" },
  { value: "HARASSMENT", label: "骚扰行为" },
  { value: "SCAM", label: "诈骗行为" },
  { value: "MALICIOUS", label: "恶意行为" },
  { value: "OTHER", label: "其他" },
];

const TYPE_LABELS: Record<string, string> = Object.fromEntries(
  REPORT_TYPES.map((t) => [t.value, t.label])
);

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "待处理", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  REVIEWING: { label: "审核中", cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  ACCEPTED: { label: "已采纳", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  REJECTED: { label: "已驳回", cls: "bg-red-500/15 text-red-400 border-red-500/30" },
};

function formatDate(d: string) {
  return new Date(d).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ─── Report Form ────────────────────────────────────── */

function ReportForm({ prefillTarget, onSubmitted }: { prefillTarget?: string; onSubmitted: () => void }) {
  const [targetUserId, setTargetUserId] = useState(prefillTarget || "");
  const [type, setType] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!targetUserId.trim()) return setMsg({ text: "请输入被举报用户的QQ号", ok: false });
    if (!type) return setMsg({ text: "请选择举报类型", ok: false });
    if (description.trim().length < 5) return setMsg({ text: "描述至少5个字", ok: false });

    setSubmitting(true);
    setMsg(null);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUserId: targetUserId.trim(),
          type,
          description: description.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "提交失败");
      setMsg({ text: "举报已提交，我们会尽快处理", ok: true });
      setType("");
      setDescription("");
      setTargetUserId("");
      onSubmitted();
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : "提交失败", ok: false });
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-3 py-2.5 text-sm text-[hsl(var(--foreground))] outline-none focus:border-[hsl(var(--primary))] transition-colors";

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
      <h2 className="mb-5 text-base font-semibold text-[hsl(var(--foreground))]">📝 提交举报</h2>

      {/* Target user */}
      <div className="mb-4">
        <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--foreground))]">
          被举报用户QQ号 <span className="text-[hsl(var(--destructive))]">*</span>
        </label>
        <input
          type="text"
          value={targetUserId}
          onChange={(e) => setTargetUserId(e.target.value)}
          placeholder="输入对方的QQ号..."
          className={inputCls}
        />
        <p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">
          可从匹配详情页或聊天中获取对方QQ号
        </p>
      </div>

      {/* Type */}
      <div className="mb-4">
        <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--foreground))]">
          举报类型 <span className="text-[hsl(var(--destructive))]">*</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {REPORT_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setType(t.value)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                type === t.value
                  ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))]"
                  : "border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--primary)/0.3)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Description */}
      <div className="mb-5">
        <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--foreground))]">
          详细描述 <span className="text-[hsl(var(--destructive))]">*</span>
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="请详细描述情况（至少5个字）..."
          rows={4}
          maxLength={1000}
          className={inputCls}
        />
        <p className="mt-1 text-right text-[11px] text-[hsl(var(--muted-foreground))]">
          {description.length}/1000
        </p>
      </div>

      {msg && (
        <p className={`mb-3 text-sm ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-gradient-to-r from-[hsl(0,70%,50%)] to-[hsl(15,70%,50%)] py-2.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
      >
        {submitting ? "提交中..." : "🚨 提交举报"}
      </button>
    </form>
  );
}

/* ─── Main Page ──────────────────────────────────────── */

function UserReportsContent() {
  const searchParams = useSearchParams();
  const prefillTarget = searchParams.get("target") || undefined;
  const [reports, setReports] = useState<MyReport[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchReports = useCallback(async () => {
    try {
      const res = await fetch("/api/reports?pageSize=50");
      if (res.ok) {
        const data = await res.json();
        setReports(data.data || []);
      }
    } catch {
      // non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">🚨 举报中心</h1>

      {/* Report form */}
      <ReportForm prefillTarget={prefillTarget} onSubmitted={fetchReports} />

      {/* My reports history */}
      <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
        <h2 className="mb-4 text-base font-semibold text-[hsl(var(--foreground))]">📋 我的举报记录</h2>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[hsl(var(--primary))] border-t-transparent" />
          </div>
        )}

        {!loading && reports.length === 0 && (
          <p className="py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
            暂无举报记录
          </p>
        )}

        {!loading && reports.length > 0 && (
          <div className="space-y-3">
            {reports.map((r) => {
              const statusInfo = STATUS_LABELS[r.status] || { label: r.status, cls: "" };
              return (
                <div
                  key={r.id}
                  className="rounded-lg border border-[hsl(var(--border)/0.5)] bg-[hsl(var(--secondary)/0.3)] p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[hsl(var(--foreground))]">
                          {TYPE_LABELS[r.type] || r.type}
                        </span>
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusInfo.cls}`}>
                          {statusInfo.label}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                        举报对象: {r.targetNickname || r.targetQQ || r.targetUserId}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] text-[hsl(var(--muted-foreground))]">
                      {formatDate(r.createdAt)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
                    {r.description}
                  </p>
                  {r.resolution && (
                    <div className="mt-2 rounded-md bg-[hsl(var(--secondary)/0.5)] px-3 py-2">
                      <p className="text-[11px] font-medium text-[hsl(var(--foreground))]">处理结果:</p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">{r.resolution}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function UserReportsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[hsl(var(--primary))] border-t-transparent" />
        </div>
      }
    >
      <UserReportsContent />
    </Suspense>
  );
}

