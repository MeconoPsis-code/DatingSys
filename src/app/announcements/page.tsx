import { PublicTopNav } from "@/components/public-top-nav";
import { db } from "@/lib/db";
import { getSessionPayload } from "@/lib/session";

export const dynamic = "force-dynamic";

function formatDate(date: Date | null): string {
  if (!date) return "未发布";
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function AnnouncementsPage() {
  const [announcements, session] = await Promise.all([
    db.announcement.findMany({
      where: { status: "PUBLISHED" },
      orderBy: [
        { pinned: "desc" },
        { publishedAt: "desc" },
        { createdAt: "desc" },
      ],
      include: {
        author: {
          select: {
            qqNumber: true,
            authIdentities: { select: { nickname: true }, take: 1 },
          },
        },
      },
    }),
    getSessionPayload(),
  ]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#fafbfe] px-3 py-24 text-brand-text sm:px-4 sm:py-28">
      <PublicTopNav active="announcements" isLoggedIn={Boolean(session)} />

      <div className="pointer-events-none absolute -right-28 top-12 h-80 w-80 rounded-full bg-[#ebf2ff]" />
      <div className="pointer-events-none absolute -left-36 bottom-8 h-96 w-96 rounded-full bg-[#ebf2ff]" />

      <main className="relative z-10 mx-auto flex w-full max-w-4xl flex-col gap-6 sm:gap-8">
        <header className="text-center">
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-blue/10 text-brand-blue shadow-[0_10px_24px_rgba(22,119,255,0.12)] sm:h-12 sm:w-12">
            <svg
              viewBox="0 0 24 24"
              className="h-6 w-6 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round"
            >
              <path d="M4 19.5V4.5A2.5 2.5 0 0 1 6.5 2H20v18H6.5A2.5 2.5 0 0 1 4 17.5" />
              <path d="M8 6h8" />
              <path d="M8 10h8" />
              <path d="M8 14h5" />
            </svg>
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-blue/70 sm:text-sm sm:tracking-[0.22em]">
            TenMatch Notice
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.5px] text-brand-blue sm:text-4xl">
            系统公告
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-brand-muted">
            查看 TenMatch 匹配系统的使用说明、维护通知和重要更新。
          </p>
        </header>

        {announcements.length === 0 ? (
          <section className="rounded-[20px] border border-brand-line bg-white/90 px-4 py-16 text-center shadow-[0_18px_48px_rgba(22,119,255,0.08)] sm:rounded-[24px] sm:px-6 sm:py-20">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-brand-subtle">
              <svg
                viewBox="0 0 24 24"
                className="h-7 w-7 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round"
              >
                <path d="M4 19.5V4.5A2.5 2.5 0 0 1 6.5 2H20v18H6.5A2.5 2.5 0 0 1 4 17.5" />
                <path d="M8 7h7" />
                <path d="M8 11h5" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-brand-text">暂无公告</h2>
            <p className="mt-2 text-sm text-brand-muted">管理员发布后会显示在这里。</p>
          </section>
        ) : (
          <section className="flex flex-col gap-4 sm:gap-5">
            {announcements.map((item) => {
              const authorName =
                item.author?.authIdentities[0]?.nickname ?? item.author?.qqNumber ?? "TenMatch";

              return (
                <article
                  key={item.id}
                  className={`rounded-[20px] border bg-white/95 p-4 shadow-[0_18px_48px_rgba(22,119,255,0.08)] transition-all hover:-translate-y-0.5 hover:border-brand-blue/25 hover:shadow-[0_22px_56px_rgba(22,119,255,0.12)] sm:rounded-[24px] sm:p-6 ${
                    item.pinned ? "border-brand-blue/30" : "border-brand-line"
                  }`}
                >
                  <div className="mb-4 flex flex-wrap items-center gap-2 text-xs font-semibold text-brand-subtle">
                    {item.pinned && (
                      <span className="inline-flex items-center rounded-full bg-brand-blue/10 px-3 py-1 text-brand-blue">
                        置顶
                      </span>
                    )}
                    <span>{formatDate(item.publishedAt)}</span>
                    <span className="text-brand-line">/</span>
                    <span>{authorName}</span>
                  </div>

                  <h2 className="text-center text-xl font-extrabold tracking-[-0.3px] text-brand-text sm:text-2xl">
                    {item.title}
                  </h2>
                  {item.summary && (
                    <p className="mt-3 rounded-2xl bg-blue-1 px-4 py-3 text-sm font-medium leading-7 text-brand-blue">
                      {item.summary}
                    </p>
                  )}
                  <div className="mt-5 whitespace-pre-wrap text-sm leading-7 text-brand-muted sm:text-[15px] sm:leading-8">
                    {item.content}
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </main>
    </div>
  );
}
