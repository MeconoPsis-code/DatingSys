import { redirect } from "next/navigation";
import { getSessionPayload } from "@/lib/session";

export default async function LandingPage() {
  // Auth-aware redirect
  const session = await getSessionPayload();
  if (session) {
    redirect("/profile");
  }

  return (
    <div className="relative flex min-h-screen lg:h-screen w-full items-center justify-center bg-[#fafbfe] p-0 font-sans lg:overflow-hidden">
      {/* ─── DESKTOP PC VIEWPORT (lg:flex) ─────────────────────────────────── */}
      <div className="app-window relative z-10 hidden h-screen w-screen flex-col overflow-hidden bg-[#fafbfe] lg:flex">
        {/* Ambient background circles */}
        <div className="pointer-events-none absolute -right-[180px] -top-[180px] z-0 h-[540px] w-[540px] rounded-full bg-[#ebf2ff]" />
        <div className="pointer-events-none absolute -bottom-[180px] -left-[180px] z-0 h-[480px] w-[480px] rounded-full bg-[#ebf2ff]" />

        {/* Top Left Header Logo */}
        <header className="absolute left-0 top-0 z-10 flex w-full items-center justify-between px-[80px] py-12">
          <a href="#" className="logo-area flex items-center gap-4 no-underline">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/app_icon_dark.png" className="logo-icon h-[64px] w-auto object-contain mix-blend-multiply transition-transform duration-300 hover:scale-105" alt="TenMatch Icon" />
            <span className="font-outfit text-[36px] font-extrabold tracking-[-0.5px] text-brand-blue">TenMatch</span>
          </a>
        </header>

        {/* Main Content Layout */}
        <main className="main-container z-10 mt-[80px] grid flex-1 grid-cols-[1.2fr_1fr] items-center pl-[120px] pr-[80px] w-full">
          {/* Left Hero Column */}
          <section className="content-left flex flex-col items-start max-w-[740px]">
            {/* Shield Badge */}
            <div className="landing-animate-fadeInDown mb-8 inline-flex items-center gap-2.5 rounded-full border border-brand-blue/15 bg-blue-1 px-5 py-2 text-[16px] font-semibold tracking-[0.2px] text-brand-blue">
              <span className="flex h-[18px] w-[18px] items-center justify-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5">
                  <path d="M20 13c0 5-3.5 7.5-7.66 9.7a1 1 0 0 1-.68 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 .76-.97l8-2a1 1 0 0 1 .48 0l8 2A1 1 0 0 1 20 6z"/>
                  <path d="m9 12 2 2 4-4"/>
                </svg>
              </span>
              仅限指定 QQ 群认证成员
            </div>

            {/* Main Heading */}
            <h1 className="title-brand font-outfit landing-animate-fadeInLeft mb-4 text-[112px] font-black leading-[1.05] tracking-[-2px] text-brand-blue">
              TenMatch
            </h1>
            <h2 className="title-sub landing-animate-fadeInLeft animation-delay-100 mb-3 text-[42px] font-bold tracking-[-0.5px] text-brand-text">
              QQ 群成员资料匹配系统
            </h2>
            <p className="title-desc landing-animate-fadeInLeft animation-delay-200 mb-12 text-[22px] font-medium tracking-[0.5px] text-brand-muted">
              填写资料 · 自动匹配 · 保护隐私
            </p>

            {/* CTA Button */}
            <div className="landing-animate-fadeInLeft animation-delay-300">
              <a href="/login" className="relative inline-flex h-[68px] items-center justify-center gap-3.5 overflow-hidden rounded-xl bg-brand-blue px-16 text-[22px] font-semibold text-white shadow-[0_10px_24px_rgba(22,119,255,0.25)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-brand-blue/95 hover:shadow-[0_12px_30px_rgba(22,119,255,0.35)] active:translate-y-px active:shadow-[0_6px_16px_rgba(22,119,255,0.2)]">
                <span className="flex h-[22px] w-[22px] items-center justify-center">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/>
                  </svg>
                </span>
                进入登录
              </a>
            </div>

            {/* Terms Policy Link */}
            <p className="landing-animate-fadeInLeft animation-delay-400 mt-8 text-[15px] text-brand-muted">
              登录即表示同意<a href="#" className="font-medium text-brand-blue no-underline hover:underline">《用户协议》</a>和<a href="#" className="font-medium text-brand-blue no-underline hover:underline">《隐私政策》</a>
            </p>
          </section>

          {/* Right Scene Column */}
          <section className="content-right relative flex h-full w-full items-center justify-center">
            <div className="scene-wrapper relative flex h-[820px] w-[820px] items-center justify-center">
              {/* Sparkling Stars */}
              <svg className="landing-animate-twinkle absolute left-[460px] top-[130px] z-10 fill-brand-blue/50 text-brand-blue/50" width="16" height="16" viewBox="0 0 24 24">
                <path d="M12 0L14.8 9.2L24 12L14.8 14.8L12 24L9.2 14.8L0 12L9.2 9.2Z" />
              </svg>
              <svg className="landing-animate-twinkle animation-delay-1000 absolute right-[40px] top-[260px] z-10 fill-brand-blue/50 text-brand-blue/50" width="20" height="20" viewBox="0 0 24 24">
                <path d="M12 0L14.8 9.2L24 12L14.8 14.8L12 24L9.2 14.8L0 12L9.2 9.2Z" />
              </svg>
              <svg className="landing-animate-twinkle animation-delay-500 absolute bottom-[240px] left-[30px] z-10 fill-brand-blue/50 text-brand-blue/50" width="18" height="18" viewBox="0 0 24 24">
                <path d="M12 0L14.8 9.2L24 12L14.8 14.8L12 24L9.2 14.8L0 12L9.2 9.2Z" />
              </svg>
              <svg className="landing-animate-twinkle animation-delay-1500 absolute bottom-[180px] right-[160px] z-10 fill-brand-blue/50 text-brand-blue/50" width="15" height="15" viewBox="0 0 24 24">
                <path d="M12 0L14.8 9.2L24 12L14.8 14.8L12 24L9.2 14.8L0 12L9.2 9.2Z" />
              </svg>

              {/* Dashed Orbit Line */}
              <div className="orbit-ring landing-animate-orbit absolute z-0 h-[550px] w-[700px] -rotate-10 rounded-full border-[1.5px] border-dashed border-brand-blue/20" />
 
              {/* Character Portrait */}
              <div className="portrait-container landing-animate-portrait absolute bottom-[40px] z-10 flex h-[650px] w-[650px] items-end justify-center overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/portrait_transparent.png" className="landing-animate-float h-auto w-full object-contain [mask-image:linear-gradient(to_bottom,rgba(0,0,0,1)_85%,rgba(0,0,0,0)_100%)] [-webkit-mask-image:linear-gradient(to_bottom,rgba(0,0,0,1)_85%,rgba(0,0,0,0)_100%)]" alt="TenMatch Mascot" />
              </div>
              
              {/* Orbit Badge: Speech Bubble */}
              <div className="badge-speech landing-animate-badge1 absolute left-[60px] top-[220px] z-20 flex h-14 w-14 cursor-pointer items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-[#d3e5ff] to-[#b2d3ff] shadow-[0_8px_20px_rgba(22,119,255,0.16)] transition-all duration-300 hover:-translate-y-1 hover:scale-110 hover:shadow-[0_12px_24px_rgba(22,119,255,0.25)]" title="聊天沟通">
                <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
                  <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z" fill="#1677ff" stroke="#1677ff" strokeWidth="2" strokeLinejoin="round"/>
                  <circle cx="8" cy="10" r="1.5" fill="#ffffff"/>
                  <circle cx="12" cy="10" r="1.5" fill="#ffffff"/>
                  <circle cx="16" cy="10" r="1.5" fill="#ffffff"/>
                </svg>
              </div>
 
              {/* Orbit Badge: Shield Check */}
              <div className="badge-shield landing-animate-badge2 absolute bottom-[190px] left-[100px] z-20 flex h-14 w-14 cursor-pointer items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-[#d3e5ff] to-[#b2d3ff] shadow-[0_8px_20px_rgba(22,119,255,0.16)] transition-all duration-300 hover:scale-110 hover:translate-y-1 hover:shadow-[0_12px_24px_rgba(22,119,255,0.25)]" title="安全认证">
                <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
                  <path d="M12 22C12 22 20 18 20 12V5L12 2L4 5V12C4 18 12 22 12 22Z" fill="#1677ff" stroke="#1677ff" strokeWidth="2" strokeLinejoin="round"/>
                  <path d="M9 11L11 13L15 9" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
 
              {/* Orbit Badge: Users / Group Match */}
              <div className="badge-users landing-animate-badge3 absolute right-[30px] top-[390px] z-20 flex h-14 w-14 cursor-pointer items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-[#d3e5ff] to-[#b2d3ff] shadow-[0_8px_20px_rgba(22,119,255,0.16)] transition-all duration-300 hover:-translate-y-0.5 hover:scale-110 hover:shadow-[0_12px_24px_rgba(22,119,255,0.25)]" title="成员匹配">
                <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
                  <path d="M16 8C17.66 8 19 6.66 19 5C19 3.34 17.66 2 16 2C14.34 2 13 3.34 13 5C13 6.66 14.34 8 16 8Z" fill="#1677ff" opacity="0.75"/>
                  <path d="M16 10C13.67 10 9 11.17 9 13.5V16H23V13.5C23 11.17 18.33 10 16 10Z" fill="#1677ff" opacity="0.75"/>
                  <path d="M8 8C9.66 8 11 6.66 11 5C11 3.34 9.66 2 8 2C6.34 2 5 3.34 5 5C5 6.66 6.34 8 8 8Z" fill="#1677ff"/>
                  <path d="M8 10C5.67 10 1 11.17 1 13.5V16H15V13.5C15 11.17 10.33 10 8 10Z" fill="#1677ff"/>
                </svg>
              </div>
            </div>
          </section>
        </main>
      </div>

      {/* ─── MOBILE VIEWPORT & TABLET SIMULATOR (lg:hidden) ───────────────── */}
      <div className="relative z-10 flex h-full w-full max-w-[390px] flex-col overflow-hidden bg-white shadow-none md:h-[844px] md:rounded-[40px] md:border-[12px] md:border-[#1a1a1a] md:shadow-[0_32px_80px_rgba(29,33,41,0.2),0_4px_16px_rgba(29,33,41,0.08)] lg:hidden">
        {/* Ambient Background Accents */}
        <div className="pointer-events-none absolute -right-[100px] -top-[100px] z-0 h-[300px] w-[300px] rounded-full bg-[#ebf2ff]" />
        <div className="pointer-events-none absolute -bottom-[80px] -left-[100px] z-0 h-[260px] w-[260px] rounded-full bg-[#ebf2ff]" />

        {/* Mobile Status Bar (Hidden on real mobile pages, shown on desktop preview) */}
        <div className="hidden h-11 justify-between px-6 py-3 text-sm font-semibold text-brand-text md:flex">
          <span>9:41</span>
          <div className="flex items-center gap-1.5">
            <svg className="h-[17px] w-[17px]" viewBox="0 0 24 24" fill="currentColor">
              <rect x="3" y="15" width="2.5" height="5" rx="0.5" />
              <rect x="7" y="11" width="2.5" height="9" rx="0.5" />
              <rect x="11" y="7" width="2.5" height="13" rx="0.5" />
              <rect x="15" y="4" width="2.5" height="16" rx="0.5" />
            </svg>
            <svg className="h-[17px] w-[17px]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 21a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm-3.5-3.5a5 5 0 0 1 7 0l-1 1a3.6 3.6 0 0 0-5 0l-1-1zm-2-2a7.8 7.8 0 0 1 11 0l-1 1a6.4 6.4 0 0 0-9 0l-1-1zm-2-2a10.6 10.6 0 0 1 15 0l-1 1a9.2 9.2 0 0 0-13 0l-1-1z"/>
            </svg>
            <svg className="h-[17px] w-[17px]" viewBox="0 0 24 24" fill="currentColor">
              <rect x="2" y="7" width="14" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
              <rect x="4" y="9" width="10" height="6" rx="1" />
              <path d="M17 10v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
        </div>

        {/* Mobile Header Navigation */}
        <header className="z-10 flex h-[54px] items-center justify-between px-5">
          <a href="#" className="logo-area flex items-center gap-2 no-underline">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/app_icon_dark.png" className="logo-icon h-7 w-auto object-contain mix-blend-multiply" alt="TenMatch Icon" />
            <span className="font-outfit text-lg font-extrabold tracking-[-0.3px] text-brand-blue">TenMatch</span>
          </a>
          <a href="#" className="text-[13.5px] font-medium text-brand-muted no-underline hover:text-brand-blue">了解更多 &gt;</a>
        </header>

        {/* Scrollable Mobile Content Area */}
        <main className="z-10 flex flex-1 flex-col items-center overflow-y-auto px-5 pt-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {/* Shield Badge */}
          <div className="landing-animate-fadeInDown mb-4 inline-flex items-center gap-1 rounded-full border border-brand-blue/15 bg-blue-1 px-3 py-1.5 text-[11.5px] font-semibold tracking-[0.1px] text-brand-blue">
            <span className="flex h-3.5 w-3.5 items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 13c0 5-3.5 7.5-7.66 9.7a1 1 0 0 1-.68 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 .76-.97l8-2a1 1 0 0 1 .48 0l8 2A1 1 0 0 1 20 6z"/>
                <path d="m9 12 2 2 4-4"/>
              </svg>
            </span>
            仅限指定 QQ 群认证成员
          </div>

          {/* Typography */}
          <h1 className="font-outfit landing-animate-fadeInUp mb-1.5 text-[52px] font-black leading-[1.05] tracking-[-1.5px] text-brand-blue">
            TenMatch
          </h1>
          <h2 className="landing-animate-fadeInUp mb-1 text-center text-[20px] font-bold text-brand-text">
            QQ 群成员资料匹配系统
          </h2>
          <p className="landing-animate-fadeInUp mb-5 text-[13px] font-medium text-brand-muted">
            填写资料 · 自动匹配 · 保护隐私
          </p>

          {/* Interactive Portrait & Orbit Scene */}
          <section className="landing-animate-fadeInUp relative mb-5 flex h-[290px] w-full items-center justify-center">
            {/* Sparkles */}
            <svg className="landing-animate-twinkle absolute left-[170px] top-[45px] z-10 fill-brand-blue/50 text-brand-blue/50" width="11" height="11" viewBox="0 0 24 24">
              <path d="M12 0L14.8 9.2L24 12L14.8 14.8L12 24L9.2 14.8L0 12L9.2 9.2Z" />
            </svg>
            <svg className="landing-animate-twinkle animation-delay-1000 absolute right-[25px] top-[90px] z-10 fill-brand-blue/50 text-brand-blue/50" width="14" height="14" viewBox="0 0 24 24">
              <path d="M12 0L14.8 9.2L24 12L14.8 14.8L12 24L9.2 14.8L0 12L9.2 9.2Z" />
            </svg>
            <svg className="landing-animate-twinkle animation-delay-500 absolute bottom-[85px] left-[10px] z-10 fill-brand-blue/50 text-brand-blue/50" width="12" height="12" viewBox="0 0 24 24">
              <path d="M12 0L14.8 9.2L24 12L14.8 14.8L12 24L9.2 14.8L0 12L9.2 9.2Z" />
            </svg>
            <svg className="landing-animate-twinkle animation-delay-1500 absolute bottom-[70px] right-[65px] z-10 fill-brand-blue/50 text-brand-blue/50" width="10" height="10" viewBox="0 0 24 24">
              <path d="M12 0L14.8 9.2L24 12L14.8 14.8L12 24L9.2 14.8L0 12L9.2 9.2Z" />
            </svg>

            {/* Orbit Ring */}
            <div className="landing-animate-orbit absolute z-0 h-[250px] w-[320px] -rotate-10 rounded-full border-[1.5px] border-dashed border-brand-blue/25" />

            {/* Portrait Image */}
            <div className="absolute z-10 flex h-[250px] w-[250px] items-end justify-center overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/portrait_transparent.png" className="landing-animate-float h-auto w-full object-contain [mask-image:linear-gradient(to_bottom,rgba(0,0,0,1)_85%,rgba(0,0,0,0)_100%)] [-webkit-mask-image:linear-gradient(to_bottom,rgba(0,0,0,1)_85%,rgba(0,0,0,0)_100%)]" alt="TenMatch Mascot" />
            </div>

            {/* Orbit Badges */}
            <div className="landing-animate-badge1 absolute left-[18px] top-[85px] z-20 flex h-9 w-9 items-center justify-center rounded-full border border-white bg-gradient-to-br from-[#d3e5ff] to-[#b2d3ff] shadow-[0_6px_15px_rgba(22,119,255,0.14)]" title="聊天沟通">
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z" fill="#1677ff" stroke="#1677ff" strokeWidth="2" strokeLinejoin="round"/>
                <circle cx="8" cy="10" r="1.5" fill="#ffffff"/>
                <circle cx="12" cy="10" r="1.5" fill="#ffffff"/>
                <circle cx="16" cy="10" r="1.5" fill="#ffffff"/>
              </svg>
            </div>

            <div className="landing-animate-badge2 absolute bottom-[60px] left-[35px] z-20 flex h-9 w-9 items-center justify-center rounded-full border border-white bg-gradient-to-br from-[#d3e5ff] to-[#b2d3ff] shadow-[0_6px_15px_rgba(22,119,255,0.14)]" title="安全认证">
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                <path d="M12 22C12 22 20 18 20 12V5L12 2L4 5V12C4 18 12 22 12 22Z" fill="#1677ff" stroke="#1677ff" strokeWidth="2" strokeLinejoin="round"/>
                <path d="M9 11L11 13L15 9" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>

            <div className="landing-animate-badge3 absolute right-[12px] top-[140px] z-20 flex h-9 w-9 items-center justify-center rounded-full border border-white bg-gradient-to-br from-[#d3e5ff] to-[#b2d3ff] shadow-[0_6px_15px_rgba(22,119,255,0.14)]" title="成员匹配">
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                <path d="M16 8C17.66 8 19 6.66 19 5C19 3.34 17.66 2 16 2C14.34 2 13 3.34 13 5C13 6.66 14.34 8 16 8Z" fill="#1677ff" opacity="0.75"/>
                <path d="M16 10C13.67 10 9 11.17 9 13.5V16H23V13.5C23 11.17 18.33 10 16 10Z" fill="#1677ff" opacity="0.75"/>
                <path d="M8 8C9.66 8 11 6.66 11 5C11 3.34 9.66 2 8 2C6.34 2 5 3.34 5 5C5 6.66 6.34 8 8 8Z" fill="#1677ff"/>
                <path d="M8 10C5.67 10 1 11.17 1 13.5V16H15V13.5C15 11.17 10.33 10 8 10Z" fill="#1677ff"/>
              </svg>
            </div>
          </section>

          {/* CTA & Agreements */}
          <section className="landing-animate-fadeInUp animation-delay-200 flex w-full flex-col items-center">
            {/* Login Button */}
            <a href="/login" className="flex h-12 w-full max-w-[320px] items-center justify-center gap-2 rounded-xl bg-brand-blue text-[15.5px] font-semibold text-white no-underline shadow-[0_8px_20px_rgba(22,119,255,0.22)] transition-all hover:bg-brand-blue/95 hover:shadow-[0_10px_24px_rgba(22,119,255,0.3)]">
              <span className="flex h-[17px] w-[17px] items-center justify-center">
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
              </span>
              进入登录
            </a>

            {/* Agreement row */}
            <div className="mt-4 flex items-center gap-1.5">
              <span className="text-[11.5px] font-medium text-brand-muted">
                登录即表示同意<a href="#" className="font-semibold text-brand-blue no-underline hover:underline">《用户协议》</a>和<a href="#" className="font-semibold text-brand-blue no-underline hover:underline">《隐私政策》</a>
              </span>
            </div>
          </section>

          {/* Feature Grid Row */}
          <section className="landing-animate-fadeInUp animation-delay-300 mt-6 grid w-full grid-cols-3 gap-1 border-t border-brand-blue/5 py-4">
            <div className="flex flex-col items-center text-center">
              <div className="mb-1.5 flex h-8.5 w-8.5 items-center justify-center rounded-full bg-brand-blue/5 transition-all duration-200 hover:bg-brand-blue/10">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-brand-blue">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                </svg>
              </div>
              <span className="text-[10.5px] font-bold text-brand-text">群认证专属</span>
              <span className="text-[8.5px] text-brand-muted">仅限认证成员</span>
            </div>

            <div className="flex flex-col items-center text-center">
              <div className="mb-1.5 flex h-8.5 w-8.5 items-center justify-center rounded-full bg-brand-blue/5 transition-all duration-200 hover:bg-brand-blue/10">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-brand-blue">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                </svg>
              </div>
              <span className="text-[10.5px] font-bold text-brand-text">资料智能匹配</span>
              <span className="text-[8.5px] text-brand-muted">快速找到同好</span>
            </div>

            <div className="flex flex-col items-center text-center">
              <div className="mb-1.5 flex h-8.5 w-8.5 items-center justify-center rounded-full bg-brand-blue/5 transition-all duration-200 hover:bg-brand-blue/10">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-brand-blue">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <span className="text-[10.5px] font-bold text-brand-text">隐私双向保护</span>
              <span className="text-[8.5px] text-brand-muted">解锁可见敏感资料</span>
            </div>
          </section>

          {/* Footer inside mobile view */}
          <footer className="mt-auto py-4 text-center text-[10px] text-brand-muted">
            图片仅供参考，实际以上线产品为准
          </footer>
        </main>

        {/* Physical Home Indicator bar for iOS frame simulator */}
        <div className="absolute bottom-2 left-1/2 h-[5px] w-[134px] -translate-x-1/2 rounded-full bg-black md:block hidden pointer-events-none" />
      </div>
    </div>
  );
}
