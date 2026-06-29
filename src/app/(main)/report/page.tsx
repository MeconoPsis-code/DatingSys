"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

interface ReportableTarget {
  targetQQ: string;
  nickname: string | null;
  approvedAt: string | null;
}

interface MyReport {
  id: string;
  targetNickname: string | null;
  targetQQ: string | null;
  type: string;
  description: string;
  evidence: EvidenceItem[];
  status: string;
  resolution: string | null;
  createdAt: string;
  handledAt: string | null;
}

interface EvidenceItem {
  key: string;
  url: string;
}

interface EvidenceFile {
  id: string;
  file: File;
  previewUrl: string;
}

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
  REPORT_TYPES.map((type) => [type.value, type.label])
);

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "待处理", cls: "bg-amber-500/15 text-amber-500 border-amber-500/30" },
  REVIEWING: { label: "审核中", cls: "bg-blue-500/15 text-blue-500 border-blue-500/30" },
  ACCEPTED: { label: "已采纳", cls: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
  REJECTED: { label: "已驳回", cls: "bg-red-500/15 text-red-500 border-red-500/30" },
};

const MAX_EVIDENCE_FILES = 6;
const MAX_EVIDENCE_FILE_SIZE = 5 * 1024 * 1024;
const EVIDENCE_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

function formatDate(d: string) {
  return new Date(d).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ReportForm({
  target,
  onSubmitted,
}: {
  target: ReportableTarget;
  onSubmitted: () => void;
}) {
  const evidenceInputRef = useRef<HTMLInputElement>(null);
  const evidenceFilesRef = useRef<EvidenceFile[]>([]);
  const [type, setType] = useState("");
  const [description, setDescription] = useState("");
  const [evidenceFiles, setEvidenceFiles] = useState<EvidenceFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    evidenceFilesRef.current = evidenceFiles;
  }, [evidenceFiles]);

  useEffect(() => {
    return () => {
      evidenceFilesRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    };
  }, []);

  function clearEvidenceFiles() {
    evidenceFilesRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    evidenceFilesRef.current = [];
    setEvidenceFiles([]);
    if (evidenceInputRef.current) evidenceInputRef.current.value = "";
  }

  function handleEvidenceSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || []);
    e.target.value = "";
    if (selected.length === 0) return;

    if (evidenceFiles.length + selected.length > MAX_EVIDENCE_FILES) {
      return setMsg({ text: `最多上传 ${MAX_EVIDENCE_FILES} 张证据图片`, ok: false });
    }

    const nextFiles: EvidenceFile[] = [];
    for (const file of selected) {
      if (!EVIDENCE_ALLOWED_TYPES.includes(file.type)) {
        nextFiles.forEach((item) => URL.revokeObjectURL(item.previewUrl));
        return setMsg({ text: "证据图片仅支持 JPEG、PNG、WebP 格式", ok: false });
      }
      if (file.size > MAX_EVIDENCE_FILE_SIZE) {
        nextFiles.forEach((item) => URL.revokeObjectURL(item.previewUrl));
        return setMsg({ text: "单张证据图片不能超过 5MB", ok: false });
      }

      const uniqueId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      nextFiles.push({
        id: `${file.name}-${file.lastModified}-${uniqueId}`,
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }

    setMsg(null);
    setEvidenceFiles((prev) => [...prev, ...nextFiles]);
  }

  function removeEvidenceFile(id: string) {
    setEvidenceFiles((prev) => {
      const targetFile = prev.find((item) => item.id === id);
      if (targetFile) URL.revokeObjectURL(targetFile.previewUrl);
      return prev.filter((item) => item.id !== id);
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!type) return setMsg({ text: "请选择举报类型", ok: false });
    if (description.trim().length < 5) return setMsg({ text: "描述至少5个字", ok: false });

    setSubmitting(true);
    setMsg(null);
    try {
      const formData = new FormData();
      formData.append("targetQQ", target.targetQQ);
      formData.append("type", type);
      formData.append("description", description.trim());
      evidenceFiles.forEach((item) => {
        formData.append("evidence", item.file, item.file.name);
      });

      const res = await fetch("/api/reports", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "提交失败");

      setMsg({ text: "举报已提交，我们会尽快处理", ok: true });
      setType("");
      setDescription("");
      clearEvidenceFiles();
      onSubmitted();
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : "提交失败", ok: false });
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-3 py-2.5 text-sm text-[hsl(var(--foreground))] outline-none transition-colors focus:border-[hsl(var(--primary))]";

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 sm:p-6"
    >
      <h2 className="mb-5 text-base font-semibold text-[hsl(var(--foreground))]">
        提交举报
      </h2>

      <div className="mb-4 rounded-xl border border-brand-blue/20 bg-blue-1 px-4 py-3">
        <div className="text-xs font-medium text-brand-blue">已选择举报对象</div>
        <div className="mt-1 text-sm font-semibold text-[hsl(var(--foreground))]">
          {target.nickname || "匿名用户"}
        </div>
        <div className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
          QQ: {target.targetQQ}
        </div>
      </div>

      <div className="mb-4">
        <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--foreground))]">
          举报类型 <span className="text-[hsl(var(--destructive))]">*</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {REPORT_TYPES.map((reportType) => (
            <button
              key={reportType.value}
              type="button"
              onClick={() => setType(reportType.value)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                type === reportType.value
                  ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))]"
                  : "border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--primary)/0.3)]"
              }`}
            >
              {reportType.label}
            </button>
          ))}
        </div>
      </div>

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

      <div className="mb-5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <label className="block text-sm font-medium text-[hsl(var(--foreground))]">
            证据图片 <span className="text-xs font-normal text-[hsl(var(--muted-foreground))]">（可选）</span>
          </label>
          <span className="text-[11px] text-[hsl(var(--muted-foreground))]">
            {evidenceFiles.length}/{MAX_EVIDENCE_FILES}
          </span>
        </div>

        {evidenceFiles.length > 0 && (
          <div className="mb-3 grid grid-cols-3 gap-3">
            {evidenceFiles.map((item) => (
              <div
                key={item.id}
                className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary))]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.previewUrl}
                  alt={item.file.name || "证据图片"}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeEvidenceFile(item.id)}
                  className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-all hover:bg-[hsl(var(--destructive))] group-hover:opacity-100"
                  aria-label="移除证据图片"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                  <p className="truncate text-[10px] text-white/90">{item.file.name}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => evidenceInputRef.current?.click()}
          disabled={evidenceFiles.length >= MAX_EVIDENCE_FILES || submitting}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.45)] px-4 py-3 text-sm font-medium text-[hsl(var(--muted-foreground))] transition-all hover:border-[hsl(var(--primary)/0.45)] hover:text-[hsl(var(--primary))] disabled:cursor-not-allowed disabled:opacity-50"
        >
          添加截图或图片证据
        </button>
        <input
          ref={evidenceInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={handleEvidenceSelect}
          className="hidden"
        />
        <p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">
          支持 JPEG、PNG、WebP，单张不超过 5MB，最多 {MAX_EVIDENCE_FILES} 张
        </p>
      </div>

      {msg && (
        <p className={`mb-3 text-sm ${msg.ok ? "text-emerald-500" : "text-red-500"}`}>
          {msg.text}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-gradient-to-r from-[hsl(0,70%,50%)] to-[hsl(15,70%,50%)] py-2.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
      >
        {submitting ? "提交中..." : "提交举报"}
      </button>
    </form>
  );
}

function UserReportsContent() {
  const searchParams = useSearchParams();
  const prefillTargetQQ = searchParams.get("targetQQ") || undefined;
  const [targets, setTargets] = useState<ReportableTarget[]>([]);
  const [reports, setReports] = useState<MyReport[]>([]);
  const [loadingTargets, setLoadingTargets] = useState(true);
  const [loadingReports, setLoadingReports] = useState(true);
  const [selectedTargetQQ, setSelectedTargetQQ] = useState<string | null>(null);

  const fetchTargets = useCallback(async () => {
    setLoadingTargets(true);
    try {
      const res = await fetch("/api/reports/targets");
      if (res.ok) {
        const data = await res.json();
        setTargets(data.data || []);
      }
    } finally {
      setLoadingTargets(false);
    }
  }, []);

  const fetchReports = useCallback(async () => {
    setLoadingReports(true);
    try {
      const res = await fetch("/api/reports?pageSize=50");
      if (res.ok) {
        const data = await res.json();
        setReports(data.data || []);
      }
    } finally {
      setLoadingReports(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      void fetchTargets();
      void fetchReports();
    });
    return () => {
      cancelled = true;
    };
  }, [fetchTargets, fetchReports]);

  const effectiveTargetQQ = selectedTargetQQ ?? prefillTargetQQ ?? null;
  const selectedTarget =
    targets.find((target) => target.targetQQ === effectiveTargetQQ) ??
    targets[0] ??
    null;

  async function handleReportSubmitted() {
    await Promise.all([fetchReports(), fetchTargets()]);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">举报中心</h1>

      <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 sm:p-6">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-[hsl(var(--foreground))]">
            可举报对象
          </h2>
          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
            只有已通过资料查看申请、已经能互相查看资料的用户会出现在这里。点击选取举报用户。
          </p>
        </div>

        {loadingTargets && (
          <div className="flex items-center justify-center py-6">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[hsl(var(--primary))] border-t-transparent" />
          </div>
        )}

        {!loadingTargets && targets.length === 0 && (
          <p className="rounded-xl bg-[hsl(var(--secondary)/0.45)] px-4 py-5 text-center text-sm text-[hsl(var(--muted-foreground))]">
            暂无可举报对象
          </p>
        )}

        {!loadingTargets && targets.length > 0 && (
          <div className="space-y-3">
            {targets.map((target) => {
              const selected = target.targetQQ === selectedTarget?.targetQQ;
              return (
                <button
                  type="button"
                  key={target.targetQQ}
                  aria-pressed={selected}
                  onClick={() => setSelectedTargetQQ(target.targetQQ)}
                  className={`flex w-full flex-col gap-3 rounded-xl border px-4 py-3 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--card))] sm:flex-row sm:items-center sm:justify-between ${
                    selected
                      ? "border-red-500 bg-red-500 text-white shadow-sm shadow-red-500/20"
                      : "border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.3)] text-[hsl(var(--foreground))] hover:border-red-300 hover:bg-red-50/70"
                  }`}
                >
                  <div>
                    <div className={`text-sm font-semibold ${selected ? "text-white" : "text-[hsl(var(--foreground))]"}`}>
                      {target.nickname || "匿名用户"}
                    </div>
                    <div className={`text-xs ${selected ? "text-white/85" : "text-[hsl(var(--muted-foreground))]"}`}>
                      QQ: {target.targetQQ}
                    </div>
                  </div>
                  {selected && (
                    <span className="inline-flex w-fit items-center justify-center rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white">
                      已选择
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {selectedTarget && (
        <ReportForm
          key={selectedTarget.targetQQ}
          target={selectedTarget}
          onSubmitted={handleReportSubmitted}
        />
      )}

      <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 sm:p-6">
        <h2 className="mb-4 text-base font-semibold text-[hsl(var(--foreground))]">
          我的举报记录
        </h2>

        {loadingReports && (
          <div className="flex items-center justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[hsl(var(--primary))] border-t-transparent" />
          </div>
        )}

        {!loadingReports && reports.length === 0 && (
          <p className="py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
            暂无举报记录
          </p>
        )}

        {!loadingReports && reports.length > 0 && (
          <div className="space-y-3">
            {reports.map((report) => {
              const statusInfo = STATUS_LABELS[report.status] || {
                label: report.status,
                cls: "",
              };
              return (
                <div
                  key={report.id}
                  className="rounded-lg border border-[hsl(var(--border)/0.5)] bg-[hsl(var(--secondary)/0.3)] p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[hsl(var(--foreground))]">
                          {TYPE_LABELS[report.type] || report.type}
                        </span>
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusInfo.cls}`}>
                          {statusInfo.label}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                        举报对象: {report.targetNickname || report.targetQQ || "匿名用户"}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] text-[hsl(var(--muted-foreground))]">
                      {formatDate(report.createdAt)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
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
                  {report.resolution && (
                    <div className="mt-2 rounded-md bg-[hsl(var(--secondary)/0.5)] px-3 py-2">
                      <p className="text-[11px] font-medium text-[hsl(var(--foreground))]">
                        处理结果:
                      </p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">
                        {report.resolution}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
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
