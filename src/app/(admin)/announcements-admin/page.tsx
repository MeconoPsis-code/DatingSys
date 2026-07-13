"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type AnnouncementStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

interface AnnouncementItem {
  id: string;
  title: string;
  summary: string | null;
  content: string;
  status: AnnouncementStatus;
  pinned: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  authorName: string;
}

interface AnnouncementForm {
  title: string;
  summary: string;
  content: string;
  status: AnnouncementStatus;
  pinned: boolean;
}

const EMPTY_FORM: AnnouncementForm = {
  title: "",
  summary: "",
  content: "",
  status: "DRAFT",
  pinned: false,
};

const STATUS_FILTERS: Array<{ value: "" | AnnouncementStatus; label: string }> = [
  { value: "", label: "全部" },
  { value: "PUBLISHED", label: "已发布" },
  { value: "DRAFT", label: "草稿" },
  { value: "ARCHIVED", label: "已归档" },
];

const STATUS_LABELS: Record<AnnouncementStatus, string> = {
  DRAFT: "草稿",
  PUBLISHED: "已发布",
  ARCHIVED: "已归档",
};

const STATUS_STYLES: Record<AnnouncementStatus, string> = {
  DRAFT: "border-slate-200 bg-slate-100 text-brand-muted",
  PUBLISHED: "border-[#91caff] bg-[#e6f4ff] text-brand-blue",
  ARCHIVED: "border-[#ffd8bf] bg-[#fff2e8] text-[#d46b08]",
};

function formatDateTime(value: string | null): string {
  if (!value) return "未发布";
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toForm(item: AnnouncementItem): AnnouncementForm {
  return {
    title: item.title,
    summary: item.summary ?? "",
    content: item.content,
    status: item.status,
    pinned: item.pinned,
  };
}

export default function AnnouncementsAdminPage() {
  const [items, setItems] = useState<AnnouncementItem[]>([]);
  const [form, setForm] = useState<AnnouncementForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"" | AnnouncementStatus>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const editingItem = useMemo(
    () => items.find((item) => item.id === editingId) ?? null,
    [editingId, items]
  );

  const fetchAnnouncements = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/admin/announcements${params.size ? `?${params}` : ""}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "加载公告失败");
      setItems(data.data?.announcements || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载公告失败");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void fetchAnnouncements();
    });

    return () => {
      cancelled = true;
    };
  }, [fetchAnnouncements]);

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setNotice(null);
    setError(null);
  }

  function startEdit(item: AnnouncementItem) {
    setEditingId(item.id);
    setForm(toForm(item));
    setNotice(null);
    setError(null);
  }

  async function saveAnnouncement(nextStatus?: AnnouncementStatus) {
    const payload = {
      ...form,
      status: nextStatus ?? form.status,
      summary: form.summary.trim() || null,
    };

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(
        editingId ? `/api/admin/announcements/${editingId}` : "/api/admin/announcements",
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "保存公告失败");

      setNotice(nextStatus === "PUBLISHED" ? "公告已发布" : "公告已保存");
      if (nextStatus) {
        setForm((prev) => ({ ...prev, status: nextStatus }));
      }
      if (!editingId) {
        setForm(EMPTY_FORM);
      }
      await fetchAnnouncements();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存公告失败");
    } finally {
      setSaving(false);
    }
  }

  async function updateAnnouncementStatus(item: AnnouncementItem, status: AnnouncementStatus) {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const payload = {
        ...toForm(item),
        status,
        summary: item.summary ?? null,
      };

      const res = await fetch(`/api/admin/announcements/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "更新公告状态失败");

      if (editingId === item.id) {
        setForm((prev) => ({ ...prev, status }));
      }
      setNotice(status === "PUBLISHED" ? "公告已发布" : "公告状态已更新");
      await fetchAnnouncements();
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新公告状态失败");
    } finally {
      setSaving(false);
    }
  }

  async function deleteAnnouncement(item: AnnouncementItem) {
    if (!window.confirm(`确认删除公告「${item.title}」吗？`)) return;

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/announcements/${item.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "删除公告失败");
      if (editingId === item.id) resetForm();
      setNotice("公告已删除");
      await fetchAnnouncements();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除公告失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 px-2">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-brand-text">公告管理</h1>
          <p className="mt-1 text-sm text-brand-muted">
            编辑系统公告，发布后会在公共公告页展示；置顶公告会固定排在最上方。
          </p>
        </div>
        <a
          href="/announcements"
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-10 items-center justify-center rounded-xl border border-brand-blue/20 bg-white px-4 text-sm font-semibold text-brand-blue transition-all hover:bg-brand-blue/10"
        >
          查看公告页
        </a>
      </header>

      <section className="grid gap-5 xl:grid-cols-[minmax(360px,440px)_1fr]">
        <form
          className="rounded-[20px] border border-brand-line bg-white p-5 shadow-[0_18px_46px_rgba(22,119,255,0.07)]"
          onSubmit={(event) => {
            event.preventDefault();
            saveAnnouncement();
          }}
        >
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-brand-text">
                {editingItem ? "编辑公告" : "新建公告"}
              </h2>
              <p className="mt-1 text-xs text-brand-muted">
                {editingItem ? `正在编辑：${editingItem.title}` : "先保存草稿，确认后再发布。"}
              </p>
            </div>
            {editingItem && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border border-brand-line px-3 py-1.5 text-xs font-semibold text-brand-muted transition-all hover:border-brand-blue/30 hover:text-brand-blue"
              >
                新建
              </button>
            )}
          </div>

          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm font-semibold text-brand-text">标题</span>
            <input
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              maxLength={120}
              className="h-11 w-full rounded-xl border border-brand-line bg-slate-50 px-3 text-sm outline-none transition-colors focus:border-brand-blue focus:bg-white"
              placeholder="输入公告标题"
            />
          </label>

          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm font-semibold text-brand-text">摘要（可选）</span>
            <input
              value={form.summary}
              onChange={(event) => setForm((prev) => ({ ...prev, summary: event.target.value }))}
              maxLength={240}
              className="h-11 w-full rounded-xl border border-brand-line bg-slate-50 px-3 text-sm outline-none transition-colors focus:border-brand-blue focus:bg-white"
              placeholder="用于公告卡片的简短提示"
            />
          </label>

          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm font-semibold text-brand-text">正文</span>
            <textarea
              value={form.content}
              onChange={(event) => setForm((prev) => ({ ...prev, content: event.target.value }))}
              rows={10}
              className="w-full resize-y rounded-xl border border-brand-line bg-slate-50 px-3 py-3 text-sm leading-6 outline-none transition-colors focus:border-brand-blue focus:bg-white"
              placeholder="输入公告内容，换行会保留在展示页中"
            />
          </label>

          <div className="mb-5 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-brand-text">状态</span>
              <select
                value={form.status}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, status: event.target.value as AnnouncementStatus }))
                }
                className="h-11 w-full rounded-xl border border-brand-line bg-slate-50 px-3 text-sm outline-none transition-colors focus:border-brand-blue focus:bg-white"
              >
                <option value="DRAFT">草稿</option>
                <option value="PUBLISHED">发布</option>
                <option value="ARCHIVED">归档</option>
              </select>
            </label>

            <label className="flex items-end">
              <span className="flex h-11 w-full cursor-pointer items-center gap-2 rounded-xl border border-brand-line bg-slate-50 px-3 text-sm font-semibold text-brand-text transition-all hover:border-brand-blue/30">
                <input
                  type="checkbox"
                  checked={form.pinned}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, pinned: event.target.checked }))
                  }
                  className="h-4 w-4 accent-[#1677ff]"
                />
                置顶公告
              </span>
            </label>
          </div>

          {error && (
            <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </div>
          )}
          {notice && (
            <div className="mb-3 rounded-xl border border-brand-blue/20 bg-brand-blue/10 px-3 py-2 text-sm font-semibold text-brand-blue">
              {notice}
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="submit"
              disabled={saving}
              className="h-11 flex-1 rounded-xl bg-brand-blue text-sm font-bold text-white shadow-[0_10px_22px_rgba(22,119,255,0.18)] transition-all hover:bg-brand-blue/95 disabled:opacity-60"
            >
              {saving ? "保存中..." : editingId ? "保存修改" : "保存公告"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => saveAnnouncement("PUBLISHED")}
              className="h-11 flex-1 rounded-xl border border-brand-blue/20 bg-blue-1 text-sm font-bold text-brand-blue transition-all hover:border-brand-blue/40 disabled:opacity-60"
            >
              发布
            </button>
          </div>
        </form>

        <section className="rounded-[20px] border border-brand-line bg-white p-5 shadow-[0_18px_46px_rgba(22,119,255,0.07)]">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-brand-text">公告列表</h2>
              <p className="mt-1 text-xs text-brand-muted">共 {items.length} 条当前筛选结果</p>
            </div>
            <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
              {STATUS_FILTERS.map((filter) => (
                <button
                  key={filter.value || "all"}
                  type="button"
                  onClick={() => setStatusFilter(filter.value)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    statusFilter === filter.value
                      ? "bg-white text-brand-blue shadow-sm"
                      : "text-brand-muted hover:text-brand-text"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-blue border-t-transparent" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-brand-line bg-slate-50 py-16 text-center">
              <svg
                viewBox="0 0 24 24"
                className="mb-3 h-10 w-10 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round text-brand-subtle"
              >
                <path d="M4 19.5V4.5A2.5 2.5 0 0 1 6.5 2H20v18H6.5A2.5 2.5 0 0 1 4 17.5" />
                <path d="M8 7h7" />
                <path d="M8 11h5" />
              </svg>
              <p className="text-sm font-semibold text-brand-text">暂无公告</p>
              <p className="mt-1 text-xs text-brand-muted">新建公告后会出现在这里。</p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <article
                  key={item.id}
                  className={`rounded-2xl border p-4 transition-all hover:border-brand-blue/30 ${
                    editingId === item.id
                      ? "border-brand-blue/40 bg-brand-blue/5"
                      : "border-brand-line bg-white"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        {item.pinned && (
                          <span className="rounded-full bg-brand-blue/10 px-2.5 py-1 text-[11px] font-bold text-brand-blue">
                            置顶
                          </span>
                        )}
                        <span
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${STATUS_STYLES[item.status]}`}
                        >
                          {STATUS_LABELS[item.status]}
                        </span>
                        <span className="text-[11px] text-brand-subtle">
                          {formatDateTime(item.publishedAt)}
                        </span>
                      </div>
                      <h3 className="truncate text-base font-bold text-brand-text">{item.title}</h3>
                      {item.summary && (
                        <p className="mt-1 line-clamp-2 text-sm leading-6 text-brand-muted">
                          {item.summary}
                        </p>
                      )}
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-brand-subtle">
                        {item.content}
                      </p>
                      <p className="mt-3 text-[11px] text-brand-subtle">
                        作者 {item.authorName} / 更新 {formatDateTime(item.updatedAt)}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(item)}
                        className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-brand-text transition-all hover:bg-brand-blue/10 hover:text-brand-blue"
                      >
                        编辑
                      </button>
                      {item.status !== "PUBLISHED" && (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => updateAnnouncementStatus(item, "PUBLISHED")}
                          className="rounded-lg bg-blue-1 px-3 py-1.5 text-xs font-bold text-brand-blue transition-all hover:bg-brand-blue/15 disabled:opacity-60"
                        >
                          发布
                        </button>
                      )}
                      {item.status === "PUBLISHED" && (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => updateAnnouncementStatus(item, "ARCHIVED")}
                          className="rounded-lg bg-[#fff2e8] px-3 py-1.5 text-xs font-bold text-[#d46b08] transition-all hover:bg-[#ffe7ba] disabled:opacity-60"
                        >
                          归档
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => deleteAnnouncement(item)}
                        className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-500 transition-all hover:bg-red-100 disabled:opacity-60"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </div>
  );
}
