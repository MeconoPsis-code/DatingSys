"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { PublicTopNav } from "@/components/public-top-nav";

const SEED_USERS = [
  { id: "seed-super-admin", label: "超级管理员", role: "SUPER_ADMIN" },
  { id: "seed-admin", label: "管理员小明", role: "ADMIN" },
  { id: "seed-scorer-1", label: "评分官1号", role: "SCORER" },
  { id: "seed-user-1", label: "用户小红", role: "USER" },
  { id: "seed-user-2", label: "用户小蓝", role: "USER" },
];

const ERROR_MESSAGES: Record<string, string> = {
  expired: "登录已过期，请重新登录",
};

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  const [qqNumber, setQqNumber] = useState("");
  const [passcode, setPasscode] = useState("");
  const [loading, setLoading] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setFormError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qqNumber, passcode }),
      });

      const data = await res.json();

      if (!res.ok) {
        setFormError(data.error?.message || "登录失败");
        return;
      }

      // Show fullscreen loading overlay during navigation
      setLoggingIn(true);
      router.push("/profile");
    } catch {
      setFormError("网络错误，请稍后重试");
    } finally {
      if (!loggingIn) setLoading(false);
    }
  }

  // Fullscreen loading overlay
  if (loggingIn) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[hsl(var(--background))]">
        {/* Spinner */}
        <div className="relative mb-6">
          <div className="h-12 w-12 animate-spin rounded-full border-[3px] border-[hsl(var(--border))] border-t-brand-blue" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-5 w-5 rounded-full bg-brand-blue/10" />
          </div>
        </div>
        <p className="text-sm font-medium text-[hsl(var(--foreground))]">登录成功</p>
        <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">正在加载，请稍候...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pt-12 sm:pt-14">
      {/* Error alert */}
      {(error || formError) && (
        <div className="rounded-lg border border-[hsl(0,62%,50%/0.3)] bg-[hsl(0,62%,50%/0.1)] px-4 py-3 text-sm text-[hsl(0,62%,70%)]">
          {formError || ERROR_MESSAGES[error!] || "操作失败"}
        </div>
      )}

      {/* Main card */}
      <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-8">
        {/* Logo */}
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold">
            <span className="text-brand-blue font-extrabold tracking-[-0.5px]">
              TenMatch
            </span>
          </h1>
          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
            QQ 群成员资料匹配系统
          </p>
        </div>

        {/* Login form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label
              htmlFor="qqNumber"
              className="mb-1.5 block text-sm font-medium text-[hsl(var(--foreground))]"
            >
              QQ 号
            </label>
            <input
              id="qqNumber"
              type="text"
              inputMode="numeric"
              value={qqNumber}
              onChange={(e) => setQqNumber(e.target.value)}
              placeholder="请输入你的 QQ 号"
              required
              className="w-full rounded-lg border border-[hsl(var(--input))] bg-transparent px-3 py-2.5 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
            />
          </div>

          <div>
            <label
              htmlFor="passcode"
              className="mb-1.5 block text-sm font-medium text-[hsl(var(--foreground))]"
            >
              密码
            </label>
            <input
              id="passcode"
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="请输入密码"
              required
              className="w-full rounded-lg border border-[hsl(var(--input))] bg-transparent px-3 py-2.5 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-brand-blue px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-blue/20 transition-all hover:scale-[1.02] hover:bg-brand-blue/90 active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100"
          >
            {loading ? "登录中..." : "登 录"}
          </button>
        </form>

        {/* Links */}
        <div className="mt-4 flex justify-between text-xs">
          <a
            href="/forgot-passcode"
            className="text-[hsl(var(--muted-foreground))] underline-offset-4 transition-colors hover:text-[hsl(var(--foreground))] hover:underline"
          >
            忘记密码？
          </a>
          <a
            href="/signup"
            className="text-[hsl(var(--primary))] underline-offset-4 transition-colors hover:underline"
          >
            首次注册 →
          </a>
        </div>

        {/* Signup hint */}
        <div className="mt-5 rounded-xl bg-[hsl(var(--secondary))] p-4">
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            📱 首次使用？在 QQ 群中发送{" "}
            <code className="rounded bg-[hsl(var(--muted))] px-1.5 py-0.5 font-mono text-[hsl(var(--foreground))]">
              /signup
            </code>{" "}
            指令，机器人会帮你发起注册。
          </p>
        </div>
      </div>

      {/* Dev login panel — development only */}
      {process.env.NODE_ENV === "development" && (
        <div className="rounded-2xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
          <h3 className="mb-3 text-sm font-semibold text-[hsl(var(--muted-foreground))]">
            🛠️ Dev Login (开发模式)
          </h3>
          <div className="grid grid-cols-1 gap-2">
            {SEED_USERS.map((user) => (
              <a
                key={user.id}
                href={`/api/auth/dev-login?userId=${user.id}`}
                className="flex items-center justify-between rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-sm transition-colors hover:bg-[hsl(var(--secondary))]"
              >
                <span className="text-[hsl(var(--foreground))]">
                  {user.label}
                </span>
                <span className="rounded-full bg-[hsl(var(--secondary))] px-2 py-0.5 text-[10px] font-medium text-[hsl(var(--muted-foreground))]">
                  {user.role}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <>
      <PublicTopNav active="login" />
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-20">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[hsl(var(--primary))] border-t-transparent" />
          </div>
        }
      >
        <LoginContent />
      </Suspense>
    </>
  );
}
