"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";

type ActiveView = "distribution" | "scorers";

interface DistributionBucket {
  label: string;
  min: number;
  max: number;
  count: number;
  percentage: number;
}

interface ScorerStat {
  scorerUserId: string;
  nickname: string | null;
  qqNumber: string | null;
  scoreCount: number;
  averageScore: number;
  medianScore: number;
  modeScores: number[];
  modeFrequency: number;
  minScore: number;
  maxScore: number;
  stdDevScore: number;
  latestScoredAt: string | null;
}

interface ScoringDashboardData {
  summary: {
    publishedCount: number;
    publishedAverageScore: number | null;
    publishedMedianScore: number | null;
    latestPublishedAt: string | null;
    scorerCount: number;
    scorerScoreCount: number;
    scorerAverageOfAverages: number | null;
  };
  distribution: DistributionBucket[];
  scorerStats: ScorerStat[];
}

const viewTabs: Array<{ value: ActiveView; label: string }> = [
  { value: "distribution", label: "评分分布" },
  { value: "scorers", label: "评分员统计" },
];

function formatScore(score: number | null | undefined, digits = 1) {
  return typeof score === "number" ? score.toFixed(digits) : "—";
}

function formatDate(value: string | null) {
  if (!value) return "—";

  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatModes(stat: ScorerStat) {
  if (stat.modeScores.length === 0) return "无重复";

  const scores = stat.modeScores.map((score) => score.toFixed(1)).join("、");
  return stat.modeFrequency > 1 ? `${scores} (${stat.modeFrequency} 次)` : scores;
}

function getScorerName(stat: ScorerStat) {
  return stat.nickname || stat.qqNumber || `${stat.scorerUserId.slice(0, 8)}...`;
}

function scoreTone(score: number) {
  if (score >= 7) return "text-brand-green";
  if (score >= 5) return "text-brand-gold";
  return "text-brand-red";
}

function SectionHeader({ title, desc }: { title: string; desc?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-sm font-extrabold text-brand-text">{title}</h2>
      {desc && <p className="text-xs leading-5 text-brand-muted">{desc}</p>}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  desc,
  tone = "blue",
}: {
  label: string;
  value: string | number;
  desc: string;
  tone?: "blue" | "cyan" | "green" | "gold" | "rose";
}) {
  const toneClasses = {
    blue: { text: "text-brand-blue", bg: "bg-blue-1" },
    cyan: { text: "text-brand-cyan", bg: "bg-cyan-1" },
    green: { text: "text-brand-green", bg: "bg-green-1" },
    gold: { text: "text-brand-gold", bg: "bg-gold-1" },
    rose: { text: "text-brand-rose", bg: "bg-rose-1" },
  }[tone];

  return (
    <div className="min-h-[126px] rounded-[20px] border border-brand-line bg-white p-[18px] shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <span className="text-[13px] font-semibold text-brand-muted">{label}</span>
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${toneClasses.bg}`} />
      </div>
      <strong
        className={`mt-4 block text-[32px] font-extrabold leading-10 ${toneClasses.text}`}
      >
        {value}
      </strong>
      <small className="mt-1.5 block text-xs leading-[18px] text-brand-subtle">
        {desc}
      </small>
    </div>
  );
}

function EmptyPanel({ text }: { text: string }) {
  return (
    <div className="flex min-h-[220px] items-center justify-center rounded-[20px] border border-dashed border-brand-line bg-white px-4 text-sm text-brand-muted">
      {text}
    </div>
  );
}

function ScoreDistributionChart({
  buckets,
  total,
}: {
  buckets: DistributionBucket[];
  total: number;
}) {
  const maxCount = Math.max(1, ...buckets.map((bucket) => bucket.count));
  const yTicks = Array.from(
    new Set([
      maxCount,
      Math.ceil(maxCount * 0.75),
      Math.ceil(maxCount * 0.5),
      Math.ceil(maxCount * 0.25),
      0,
    ])
  ).sort((a, b) => b - a);
  const gridStyle: CSSProperties = {
    gridTemplateColumns: `repeat(${buckets.length}, minmax(0, 1fr))`,
  };

  if (total === 0) {
    return <EmptyPanel text="暂无已发布评分，发布后这里会显示分数段分布。" />;
  }

  return (
    <div className="rounded-[20px] border border-brand-line bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <SectionHeader title="已发布评分分布" desc="横轴为分数段，纵轴为对应人数。" />
        <span className="text-xs font-semibold text-brand-muted">样本 {total} 人</span>
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-[52px_1fr] gap-3">
            <div className="relative h-64">
              {yTicks.map((tick) => (
                <span
                  key={tick}
                  className="absolute right-0 translate-y-[-50%] text-[11px] font-medium text-brand-subtle"
                  style={{ top: `${100 - (tick / maxCount) * 100}%` }}
                >
                  {tick}
                </span>
              ))}
            </div>
            <div className="relative h-64 border-b border-l border-brand-line">
              {yTicks.map((tick) => (
                <span
                  key={tick}
                  className="absolute inset-x-0 border-t border-dashed border-brand-line"
                  style={{ top: `${100 - (tick / maxCount) * 100}%` }}
                />
              ))}
              <div
                className="absolute inset-x-3 bottom-0 top-0 grid items-end gap-3"
                style={gridStyle}
              >
                {buckets.map((bucket) => {
                  const height = (bucket.count / maxCount) * 100;

                  return (
                    <div
                      key={bucket.label}
                      className="flex h-full min-w-0 flex-col items-center justify-end"
                      title={`${bucket.label}: ${bucket.count} 人，占 ${bucket.percentage}%`}
                    >
                      <span className="mb-2 text-xs font-bold text-brand-muted">
                        {bucket.count}
                      </span>
                      <div
                        className="w-full rounded-t-lg bg-brand-blue shadow-[0_10px_20px_rgba(22,119,255,0.18)] transition-all"
                        style={{
                          height: `${height}%`,
                          minHeight: bucket.count > 0 ? 8 : 0,
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-[52px_1fr] gap-3">
            <span className="text-right text-[11px] font-semibold text-brand-subtle">
              人数
            </span>
            <div className="grid gap-3 px-3" style={gridStyle}>
              {buckets.map((bucket) => (
                <div key={bucket.label} className="min-w-0 text-center">
                  <div className="text-[11px] font-semibold text-brand-muted">
                    {bucket.label}
                  </div>
                  <div className="mt-1 text-[10px] text-brand-subtle">
                    {bucket.percentage}%
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3 pl-[64px] text-center text-[11px] font-semibold text-brand-subtle">
            分数段
          </div>
        </div>
      </div>
    </div>
  );
}

function ScorerAverageChart({ stats }: { stats: ScorerStat[] }) {
  const chartStats = useMemo(
    () =>
      [...stats].sort(
        (a, b) => b.averageScore - a.averageScore || b.scoreCount - a.scoreCount
      ),
    [stats]
  );

  if (chartStats.length === 0) {
    return <EmptyPanel text="暂无已完成任务的评分员数据。" />;
  }

  return (
    <div className="rounded-[20px] border border-brand-line bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <SectionHeader
          title="评分员平均分"
          desc="每条横条表示该评分员的平均评分，满分为 10 分。"
        />
        <span className="text-xs font-semibold text-brand-muted">
          {chartStats.length} 位评分员
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {chartStats.map((stat) => {
          const width = Math.max(2, Math.min(100, (stat.averageScore / 10) * 100));

          return (
            <div
              key={stat.scorerUserId}
              className="grid gap-2 sm:grid-cols-[180px_1fr_70px] sm:items-center"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-brand-text">
                  {getScorerName(stat)}
                </div>
                <div className="text-[11px] text-brand-subtle">
                  {stat.scoreCount} 次评分
                </div>
              </div>
              <div className="h-8 overflow-hidden rounded-lg bg-slate-100">
                <div
                  className="flex h-full items-center justify-end rounded-lg bg-brand-cyan pr-2 text-[11px] font-bold text-white transition-all"
                  style={{ width: `${width}%` }}
                >
                  {formatScore(stat.averageScore, 2)}
                </div>
              </div>
              <div
                className={`text-sm font-extrabold sm:text-right ${scoreTone(stat.averageScore)}`}
              >
                {formatScore(stat.averageScore, 2)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScorerStatsTable({ stats }: { stats: ScorerStat[] }) {
  if (stats.length === 0) {
    return <EmptyPanel text="暂无评分员明细。" />;
  }

  return (
    <div className="overflow-hidden rounded-[20px] border border-brand-line bg-white shadow-sm">
      <div className="border-b border-brand-line p-4 sm:p-5">
        <SectionHeader title="评分员统计明细" desc="平均分、众数、中位数和离散程度。" />
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[920px] w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-bold uppercase text-brand-subtle">
            <tr>
              <th className="px-4 py-3">评分员</th>
              <th className="px-4 py-3">评分次数</th>
              <th className="px-4 py-3">平均分</th>
              <th className="px-4 py-3">众数</th>
              <th className="px-4 py-3">中位数</th>
              <th className="px-4 py-3">标准差</th>
              <th className="px-4 py-3">最低/最高</th>
              <th className="px-4 py-3">最近评分</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-line">
            {stats.map((stat) => (
              <tr key={stat.scorerUserId} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="font-semibold text-brand-text">
                    {getScorerName(stat)}
                  </div>
                  <div className="text-xs text-brand-subtle">
                    QQ: {stat.qqNumber || "—"}
                  </div>
                </td>
                <td className="px-4 py-3 font-semibold text-brand-muted">
                  {stat.scoreCount}
                </td>
                <td
                  className={`px-4 py-3 font-extrabold ${scoreTone(stat.averageScore)}`}
                >
                  {formatScore(stat.averageScore, 2)}
                </td>
                <td className="px-4 py-3 text-brand-muted">{formatModes(stat)}</td>
                <td className="px-4 py-3 text-brand-muted">
                  {formatScore(stat.medianScore, 2)}
                </td>
                <td className="px-4 py-3 text-brand-muted">
                  {formatScore(stat.stdDevScore, 2)}
                </td>
                <td className="px-4 py-3 text-brand-muted">
                  {formatScore(stat.minScore, 1)} / {formatScore(stat.maxScore, 1)}
                </td>
                <td className="px-4 py-3 text-brand-muted">
                  {formatDate(stat.latestScoredAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ScoringDashboardPage() {
  const [data, setData] = useState<ScoringDashboardData | null>(null);
  const [activeView, setActiveView] = useState<ActiveView>("distribution");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchDashboard() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/admin/scoring/dashboard", { cache: "no-store" });
        const payload = await res.json();

        if (!res.ok) {
          throw new Error(payload.error?.message || "加载失败");
        }

        if (!cancelled) {
          setData(payload.data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "加载失败");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void fetchDashboard();

    return () => {
      cancelled = true;
    };
  }, []);

  const summaryCards = useMemo(() => {
    if (!data) return [];

    return [
      {
        label: "已发布评分",
        value: data.summary.publishedCount,
        desc: "已写入最终评分的人数",
        tone: "blue" as const,
      },
      {
        label: "最终分平均值",
        value: formatScore(data.summary.publishedAverageScore, 2),
        desc: "基于已发布最终分",
        tone: "green" as const,
      },
      {
        label: "最终分中位数",
        value: formatScore(data.summary.publishedMedianScore, 2),
        desc: `最近发布 ${formatDate(data.summary.latestPublishedAt)}`,
        tone: "gold" as const,
      },
      {
        label: "参与评分员",
        value: data.summary.scorerCount,
        desc: `${data.summary.scorerScoreCount} 条已发布任务评分`,
        tone: "rose" as const,
      },
    ];
  }, [data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-blue border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-[hsl(0,62%,50%/0.3)] bg-[hsl(0,62%,50%/0.1)] px-4 py-3 text-sm text-[hsl(0,62%,70%)]">
        {error}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="flex flex-col gap-6 px-2">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-brand-text">评分看板</h1>
        <p className="text-sm text-brand-muted">
          查看已发布评分的分布情况，以及每位评分员的平均分、众数等统计指标
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <SummaryCard key={card.label} {...card} />
        ))}
      </div>

      <div className="rounded-xl bg-white p-1 shadow-sm ring-1 ring-brand-line">
        <div className="grid grid-cols-2 gap-1 sm:flex">
          {viewTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setActiveView(tab.value)}
              className={`flex h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold transition-all ${
                activeView === tab.value
                  ? "bg-brand-blue text-white shadow-[0_10px_22px_rgba(22,119,255,0.18)]"
                  : "text-brand-muted hover:bg-blue-1 hover:text-brand-blue"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeView === "distribution" ? (
        <ScoreDistributionChart
          buckets={data.distribution}
          total={data.summary.publishedCount}
        />
      ) : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <SummaryCard
              label="评分员数"
              value={data.summary.scorerCount}
              desc="参与已发布任务评分"
              tone="cyan"
            />
            <SummaryCard
              label="评分记录"
              value={data.summary.scorerScoreCount}
              desc="已完成任务中的评分条数"
              tone="blue"
            />
            <SummaryCard
              label="评分员均值"
              value={formatScore(data.summary.scorerAverageOfAverages, 2)}
              desc="各评分员平均分的平均"
              tone="green"
            />
          </div>
          <ScorerAverageChart stats={data.scorerStats} />
          <ScorerStatsTable stats={data.scorerStats} />
        </div>
      )}
    </div>
  );
}
