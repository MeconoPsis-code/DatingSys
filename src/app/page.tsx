export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      {/* Glow effect */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[hsl(262,83%,58%)] opacity-10 blur-[120px]" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-8 text-center">
        {/* Badge */}
        <span className="inline-flex items-center rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-4 py-1.5 text-xs font-medium text-[hsl(var(--muted-foreground))]">
          仅限指定 QQ 群认证成员
        </span>

        {/* Title */}
        <h1 className="text-5xl font-bold tracking-tight sm:text-7xl">
          <span className="bg-gradient-to-r from-[hsl(262,83%,68%)] via-[hsl(290,70%,65%)] to-[hsl(320,70%,60%)] bg-clip-text text-transparent">
            Date System
          </span>
        </h1>

        {/* Subtitle */}
        <p className="max-w-md text-lg text-[hsl(var(--muted-foreground))]">
          QQ 群成员资料匹配系统
          <br />
          <span className="text-sm">填写资料 · 自动匹配 · 保护隐私</span>
        </p>

        {/* Login Button */}
        <button className="mt-4 inline-flex h-12 items-center gap-2 rounded-xl bg-gradient-to-r from-[hsl(262,83%,58%)] to-[hsl(290,70%,55%)] px-8 text-base font-semibold text-white shadow-lg shadow-[hsl(262,83%,58%)/0.25] transition-all hover:scale-105 hover:shadow-xl hover:shadow-[hsl(262,83%,58%)/0.35] active:scale-[0.98]">
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" />
          </svg>
          QQ 登录
        </button>

        {/* Footer hint */}
        <p className="mt-8 text-xs text-[hsl(var(--muted-foreground))] opacity-60">
          登录即表示同意《用户协议》和《隐私政策》
        </p>
      </div>
    </div>
  );
}
