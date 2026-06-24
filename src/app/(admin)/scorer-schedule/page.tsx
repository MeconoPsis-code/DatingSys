"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

interface WeekdayOption {
  value: number;
  label: string;
}

interface ScorerSchedule {
  id: string;
  qqNumber: string | null;
  role: "SCORER" | "ADMIN";
  nickname: string | null;
  weekdays: number[];
}

function displayScorer(scorer: ScorerSchedule) {
  return scorer.nickname || scorer.qqNumber || scorer.id.slice(0, 8);
}

function sameWeekdays(a: number[], b: number[]) {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function normalizeWeekdays(weekdays: number[]) {
  return Array.from(new Set(weekdays)).sort((a, b) => a - b);
}

export default function ScorerSchedulePage() {
  const [weekdays, setWeekdays] = useState<WeekdayOption[]>([]);
  const [today, setToday] = useState<number | null>(null);
  const [rows, setRows] = useState<ScorerSchedule[]>([]);
  const [originalRows, setOriginalRows] = useState<ScorerSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSchedule = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/scorer-schedule");
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error?.message || "加载排班失败");
      }

      const data = json.data || {};
      const nextRows = (data.scorers || []).map((scorer: ScorerSchedule) => ({
        ...scorer,
        weekdays: normalizeWeekdays(scorer.weekdays || []),
      }));

      setWeekdays(data.weekdays || []);
      setToday(data.today ?? null);
      setRows(nextRows);
      setOriginalRows(nextRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载排班失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSchedule();
  }, [fetchSchedule]);

  const dirty = useMemo(() => {
    const originalById = new Map(originalRows.map((row) => [row.id, row]));
    return rows.some((row) => {
      const original = originalById.get(row.id);
      return !original || !sameWeekdays(row.weekdays, original.weekdays);
    });
  }, [originalRows, rows]);

  const todayOnDutyCount = useMemo(() => {
    if (!today) return 0;
    return rows.filter((row) => row.weekdays.includes(today)).length;
  }, [rows, today]);

  function setRowWeekdays(scorerId: string, nextWeekdays: number[]) {
    setRows((prev) =>
      prev.map((row) =>
        row.id === scorerId
          ? { ...row, weekdays: normalizeWeekdays(nextWeekdays) }
          : row
      )
    );
  }

  function toggleWeekday(scorerId: string, weekday: number) {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== scorerId) return row;
        const isOnDuty = row.weekdays.includes(weekday);
        return {
          ...row,
          weekdays: normalizeWeekdays(
            isOnDuty
              ? row.weekdays.filter((value) => value !== weekday)
              : [...row.weekdays, weekday]
          ),
        };
      })
    );
  }

  async function saveSchedule() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/scorer-schedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schedules: rows.map((row) => ({
            scorerId: row.id,
            weekdays: row.weekdays,
          })),
        }),
      });
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error?.message || "保存排班失败");
      }

      setOriginalRows(rows.map((row) => ({ ...row, weekdays: [...row.weekdays] })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存排班失败");
    } finally {
      setSaving(false);
    }
  }

  function resetSchedule() {
    setRows(originalRows.map((row) => ({ ...row, weekdays: [...row.weekdays] })));
    setError(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-text">评分员排班</h1>
          <p className="mt-1 text-sm text-brand-muted">
            新评分任务会分配给当天值班的评分员或管理员。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={resetSchedule}
            disabled={!dirty || saving}
            className="rounded-lg border border-[#d9e2ef] px-4 py-2 text-sm font-semibold text-brand-muted transition hover:border-brand-blue hover:text-brand-blue disabled:cursor-not-allowed disabled:opacity-50"
          >
            撤销更改
          </button>
          <button
            type="button"
            onClick={saveSchedule}
            disabled={!dirty || saving}
            className="rounded-lg bg-brand-blue px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(22,119,255,0.18)] transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "保存中..." : "保存排班"}
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-[#e6edf7] bg-white p-4">
          <div className="text-xs font-semibold text-brand-muted">评分人员</div>
          <div className="mt-1 text-2xl font-bold text-brand-text">{rows.length}</div>
        </div>
        <div className="rounded-xl border border-[#e6edf7] bg-white p-4">
          <div className="text-xs font-semibold text-brand-muted">今日值班</div>
          <div className="mt-1 text-2xl font-bold text-brand-blue">{todayOnDutyCount}</div>
        </div>
        <div className="rounded-xl border border-[#e6edf7] bg-white p-4">
          <div className="text-xs font-semibold text-brand-muted">状态</div>
          <div className={`mt-1 text-sm font-bold ${dirty ? "text-amber-500" : "text-emerald-500"}`}>
            {dirty ? "有未保存更改" : "已保存"}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-500">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-[#d7e0ec] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-blue border-t-transparent" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-sm font-medium text-brand-muted">
            暂无可排班的评分员
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full border-collapse text-sm">
              <thead>
                <tr className="bg-[#2f5b9f] text-white">
                  <th className="w-16 border border-[#91a6c6] px-3 py-4 text-center font-bold">序号</th>
                  <th className="w-56 border border-[#91a6c6] px-4 py-4 text-left font-bold">ID</th>
                  {weekdays.map((weekday) => (
                    <th
                      key={weekday.value}
                      className={`w-28 border border-[#91a6c6] px-3 py-4 text-center font-bold ${
                        today === weekday.value ? "bg-[#244f90]" : ""
                      }`}
                    >
                      {weekday.label}
                    </th>
                  ))}
                  <th className="w-56 border border-[#91a6c6] px-4 py-4 text-left font-bold">快捷设置</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const rowDirty = !sameWeekdays(
                    row.weekdays,
                    originalRows.find((item) => item.id === row.id)?.weekdays || []
                  );

                  return (
                    <tr key={row.id} className={rowDirty ? "bg-amber-50/60" : "bg-white"}>
                      <td className="border border-[#b7c4d5] px-3 py-3 text-center font-bold text-brand-text">
                        {index + 1}
                      </td>
                      <td className="border border-[#b7c4d5] px-4 py-3">
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate font-bold text-brand-text">{displayScorer(row)}</span>
                          <span className="mt-1 flex items-center gap-2 text-xs text-brand-muted">
                            {row.qqNumber || row.id.slice(0, 8)}
                            {row.role === "ADMIN" && (
                              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-brand-blue">
                                管理员
                              </span>
                            )}
                          </span>
                        </div>
                      </td>
                      {weekdays.map((weekday) => {
                        const checked = row.weekdays.includes(weekday.value);
                        return (
                          <td
                            key={weekday.value}
                            className={`border border-[#b7c4d5] p-0 text-center ${
                              checked ? "bg-[#dceac4]" : "bg-[#f8fafc]"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => toggleWeekday(row.id, weekday.value)}
                              className={`flex h-14 w-full items-center justify-center text-3xl font-black transition ${
                                checked
                                  ? "text-black hover:bg-[#cddfb0]"
                                  : "text-transparent hover:bg-slate-100 hover:text-slate-300"
                              }`}
                              aria-label={`${displayScorer(row)} ${weekday.label}`}
                            >
                              ✓
                            </button>
                          </td>
                        );
                      })}
                      <td className="border border-[#b7c4d5] px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setRowWeekdays(row.id, [1, 2, 3, 4, 5])}
                            className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-brand-muted transition hover:bg-slate-200"
                          >
                            工作日
                          </button>
                          <button
                            type="button"
                            onClick={() => setRowWeekdays(row.id, [6, 7])}
                            className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-brand-muted transition hover:bg-slate-200"
                          >
                            周末
                          </button>
                          <button
                            type="button"
                            onClick={() => setRowWeekdays(row.id, weekdays.map((item) => item.value))}
                            className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-brand-muted transition hover:bg-slate-200"
                          >
                            全周
                          </button>
                          <button
                            type="button"
                            onClick={() => setRowWeekdays(row.id, [])}
                            className="rounded-md bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-black"
                          >
                            清空
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
