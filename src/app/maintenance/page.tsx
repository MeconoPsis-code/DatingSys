import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "系统升级中 | TenMatch",
  description: "TenMatch 正在进行系统维护升级",
};

export default function MaintenancePage() {
  return (
    <div className="relative flex min-h-screen min-h-dvh items-center overflow-hidden bg-[#fafbfe] px-4 py-5 text-brand-text sm:px-6 sm:py-8">
      <div className="pointer-events-none absolute -right-28 top-12 h-80 w-80 rounded-full bg-[#ebf2ff]" />
      <div className="pointer-events-none absolute -left-36 bottom-8 h-96 w-96 rounded-full bg-[#ebf2ff]" />

      <main className="relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-4 sm:gap-6">
        <header className="text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-blue/10 text-brand-blue shadow-[0_10px_24px_rgba(22,119,255,0.12)] sm:mb-4 sm:h-12 sm:w-12">
            <svg
              viewBox="0 0 24 24"
              className="h-6 w-6 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round"
              aria-hidden="true"
            >
              <path d="M12 2v3" />
              <path d="M12 19v3" />
              <path d="m4.93 4.93 2.12 2.12" />
              <path d="m16.95 16.95 2.12 2.12" />
              <path d="M2 12h3" />
              <path d="M19 12h3" />
              <path d="m4.93 19.07 2.12-2.12" />
              <path d="m16.95 7.05 2.12-2.12" />
            </svg>
          </div>

          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-blue/70 sm:text-sm sm:tracking-[0.22em]">
            TenMatch Notice
          </p>
          <h1 className="mt-2 font-['PingFang_SC','Microsoft_YaHei','SimHei',sans-serif] text-[32px] font-black leading-tight tracking-[0.02em] text-brand-ink sm:text-5xl">
            系统升级中…
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-7 text-brand-muted sm:mt-3">
            我们正在进行系统维护与版本升级，维护时间请留意 QQ 群内通知。
          </p>
        </header>

        <section className="rounded-[20px] border border-brand-line bg-white/95 p-3 shadow-[0_18px_48px_rgba(22,119,255,0.08)] sm:rounded-[24px] sm:p-6">
          <div className="rounded-2xl border border-brand-gold/25 bg-gold-1 px-4 py-3 text-sm font-medium leading-7 text-[#8a5a00] sm:py-4">
            <div className="flex gap-3">
              <svg
                viewBox="0 0 24 24"
                className="mt-0.5 h-5 w-5 shrink-0 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round text-brand-gold"
                aria-hidden="true"
              >
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
              </svg>
              <p>
                更新期间，所有功能将暂停使用。给您带来的不便，敬请谅解。
              </p>
            </div>
          </div>

          <div className="mt-3 grid gap-2.5 sm:mt-5 sm:grid-cols-3 sm:gap-3">
            <StatusCard
              title="用户端"
              desc="暂停访问"
              color="blue"
              icon={
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
              }
              extraIcon={<circle cx="12" cy="7" r="4" />}
            />
            <StatusCard
              title="匹配评分"
              desc="维护升级"
              color="cyan"
              icon={
                <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
              }
            />
            <StatusCard
              title="管理后台"
              desc="临时关闭"
              color="gold"
              icon={
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              }
              extraIcon={<circle cx="12" cy="12" r="3" />}
            />
          </div>

          <div className="mt-3 rounded-2xl bg-[#f5f7fb] px-4 py-3 sm:mt-5 sm:py-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 text-brand-blue">
                <svg
                  viewBox="0 0 24 24"
                  className="h-4.5 w-4.5 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
              </span>
              <div>
                <p className="text-sm font-semibold text-brand-text">恢复时间</p>
                <p className="mt-1 text-sm leading-6 text-brand-muted">
                  具体开放时间以 QQ 群最新通知为准。感谢您的等待与理解。
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function StatusCard({
  title,
  desc,
  color,
  icon,
  extraIcon,
}: {
  title: string;
  desc: string;
  color: "blue" | "cyan" | "gold";
  icon: React.ReactNode;
  extraIcon?: React.ReactNode;
}) {
  const styles = {
    blue: "bg-blue-1 text-brand-blue",
    cyan: "bg-cyan-1 text-brand-cyan",
    gold: "bg-gold-1 text-brand-gold",
  }[color];

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-brand-line bg-white px-4 py-3 sm:block sm:py-4">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:mb-3 ${styles}`}>
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round"
          aria-hidden="true"
        >
          {icon}
          {extraIcon}
        </svg>
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-brand-text">{title}</p>
        <p className="mt-0.5 text-xs font-medium text-brand-muted sm:mt-1">{desc}</p>
      </div>
    </div>
  );
}
