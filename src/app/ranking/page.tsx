import { PublicTopNav } from "@/components/public-top-nav";
import {
  getRankingProfileRequestStatuses,
  getTopRankingEntries,
} from "@/lib/ranking";
import { getSessionPayload } from "@/lib/session";
import { RankingTable } from "./ranking-table";

export const dynamic = "force-dynamic";

export default async function RankingPage() {
  const [rankings, session] = await Promise.all([
    getTopRankingEntries(10),
    getSessionPayload(),
  ]);
  const requestStatuses = await getRankingProfileRequestStatuses(
    session?.sub,
    rankings.map((entry) => entry.userId)
  );
  const rankingRows = rankings.map((entry) => ({
    rank: entry.rank,
    userId: entry.userId,
    nickname: entry.nickname,
    appearanceScore: entry.appearanceScore,
  }));

  return (
    <div className="relative min-h-screen min-h-dvh overflow-hidden bg-[#fafbfe] px-3 py-24 text-brand-text sm:px-4 sm:py-28">
      <PublicTopNav active="ranking" isLoggedIn={Boolean(session)} />

      <div className="pointer-events-none absolute -right-28 top-12 h-80 w-80 rounded-full bg-[#ebf2ff]" />
      <div className="pointer-events-none absolute -left-36 bottom-8 h-96 w-96 rounded-full bg-[#ebf2ff]" />

      <main className="relative z-10 mx-auto flex w-full max-w-3xl flex-col gap-6 sm:gap-8">
        <header className="text-center">
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-blue/10 text-brand-blue shadow-[0_10px_24px_rgba(22,119,255,0.12)] sm:h-12 sm:w-12">
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
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-blue/70 sm:text-sm sm:tracking-[0.22em]">
            TenMatch Ranking
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.5px] text-brand-blue sm:text-4xl">
            颜值排行
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-brand-muted">
            娱乐排行仅展示已完成评分且主动开启参与的前 10 名用户。
          </p>
        </header>

        {rankings.length === 0 ? (
          <section className="rounded-[20px] border border-brand-line bg-white/90 px-4 py-16 text-center shadow-[0_18px_48px_rgba(22,119,255,0.08)] sm:rounded-[24px] sm:px-6 sm:py-20">
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
          <RankingTable
            entries={rankingRows}
            isLoggedIn={Boolean(session)}
            initialRequestStatuses={requestStatuses}
          />
        )}
      </main>
    </div>
  );
}
