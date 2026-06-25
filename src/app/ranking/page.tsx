import { PublicTopNav } from "@/components/public-top-nav";
import { getTopRankingEntries } from "@/lib/ranking";

export const dynamic = "force-dynamic";

function scoreTone(rank: number): string {
  if (rank === 1) return "bg-brand-blue text-white shadow-[0_14px_34px_rgba(22,119,255,0.22)]";
  if (rank <= 3) return "bg-blue-1 text-brand-blue";
  return "bg-slate-100 text-brand-muted";
}

export default async function RankingPage() {
  const rankings = await getTopRankingEntries(10);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#fafbfe] px-4 py-28 text-brand-text">
      <PublicTopNav active="ranking" />

      <div className="pointer-events-none absolute -right-28 top-12 h-80 w-80 rounded-full bg-[#ebf2ff]" />
      <div className="pointer-events-none absolute -left-36 bottom-8 h-96 w-96 rounded-full bg-[#ebf2ff]" />

      <main className="relative z-10 mx-auto flex w-full max-w-3xl flex-col gap-8">
        <header className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-blue/10 text-brand-blue shadow-[0_10px_24px_rgba(22,119,255,0.12)]">
            <svg
              viewBox="0 0 24 24"
              className="h-6 w-6 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round"
            >
              <path d="M3 17h18" />
              <path d="M7 17V7" />
              <path d="M12 17V3" />
              <path d="M17 17v-6" />
            </svg>
          </div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-brand-blue/70">
            TenMatch Ranking
          </p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-[-0.5px] text-brand-blue">
            颜值排行
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-brand-muted">
            娱乐排行仅展示已完成评分且主动开启参与的前 10 名用户。
          </p>
        </header>

        {rankings.length === 0 ? (
          <section className="rounded-[24px] border border-brand-line bg-white/90 px-6 py-20 text-center shadow-[0_18px_48px_rgba(22,119,255,0.08)]">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-brand-subtle">
              <svg
                viewBox="0 0 24 24"
                className="h-7 w-7 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round"
              >
                <path d="M3 17h18" />
                <path d="M7 17V9" />
                <path d="M12 17V5" />
                <path d="M17 17v-4" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-brand-text">暂无排行</h2>
            <p className="mt-2 text-sm text-brand-muted">
              有用户完成评分并开启参与后会显示在这里。
            </p>
          </section>
        ) : (
          <section className="rounded-[24px] border border-brand-line bg-white/95 p-4 shadow-[0_18px_48px_rgba(22,119,255,0.08)]">
            <div className="grid grid-cols-[72px_1fr_110px] gap-3 border-b border-brand-line px-3 pb-3 text-xs font-bold uppercase tracking-[0.14em] text-brand-subtle">
              <span>排名</span>
              <span>昵称</span>
              <span className="text-right">颜值分</span>
            </div>

            <div className="divide-y divide-brand-line/70">
              {rankings.map((entry) => (
                <article
                  key={entry.userId}
                  className="grid grid-cols-[72px_1fr_110px] items-center gap-3 px-3 py-4"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-extrabold ${scoreTone(entry.rank)}`}
                    >
                      {entry.rank}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold text-brand-text">
                      {entry.nickname}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="font-outfit text-2xl font-extrabold text-brand-blue">
                      {entry.appearanceScore.toFixed(1)}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
