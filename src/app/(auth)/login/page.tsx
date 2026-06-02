"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

const SEED_USERS = [
  { id: "seed-super-admin", label: "超级管理员", role: "SUPER_ADMIN" },
  { id: "seed-admin", label: "管理员小明", role: "ADMIN" },
  { id: "seed-scorer-1", label: "评分官1号", role: "SCORER" },
  { id: "seed-scorer-2", label: "评分官2号", role: "SCORER" },
  { id: "seed-user-1", label: "用户小红", role: "USER" },
  { id: "seed-user-2", label: "用户小蓝", role: "USER" },
  { id: "seed-user-3", label: "用户小绿", role: "USER" },
  { id: "seed-user-4", label: "用户小紫", role: "USER" },
  { id: "seed-user-5", label: "用户小橙", role: "USER" },
];

const ERROR_MESSAGES: Record<string, string> = {
  expired: "登录链接已过期，请重新在 QQ 群中获取",
  missing_token: "链接无效，请重新获取登录链接",
  server_error: "服务器错误，请稍后重试",
};

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const from = searchParams.get("from");

  return (
    <div className="flex flex-col gap-6">
      {/* Error alert */}
      {error && (
        <div className="rounded-lg border border-[hsl(0,62%,50%/0.3)] bg-[hsl(0,62%,50%/0.1)] px-4 py-3 text-sm text-[hsl(0,62%,70%)]">
          {ERROR_MESSAGES[error] || "登录失败，请重试"}
        </div>
      )}

      {/* Main card */}
      <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-8">
        {/* Logo */}
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold">
            <span className="bg-gradient-to-r from-[hsl(262,83%,68%)] via-[hsl(290,70%,65%)] to-[hsl(320,70%,60%)] bg-clip-text text-transparent">
              Date System
            </span>
          </h1>
          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
            QQ 群成员资料匹配系统
          </p>
        </div>

        {/* Badge */}
        <div className="mb-6 flex justify-center">
          <span className="inline-flex items-center rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-4 py-1.5 text-xs font-medium text-[hsl(var(--muted-foreground))]">
            仅限指定 QQ 群认证成员
          </span>
        </div>

        {/* Instructions */}
        <div className="rounded-xl bg-[hsl(var(--secondary))] p-5">
          <h2 className="mb-3 text-sm font-semibold text-[hsl(var(--foreground))]">
            📱 登录方式
          </h2>
          <ol className="space-y-2 text-sm text-[hsl(var(--muted-foreground))]">
            <li className="flex gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--accent))] text-[10px] font-bold text-[hsl(var(--accent-foreground))]">
                1
              </span>
              <span>打开 QQ 群聊天窗口</span>
            </li>
            <li className="flex gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--accent))] text-[10px] font-bold text-[hsl(var(--accent-foreground))]">
                2
              </span>
              <span>
                发送指令{" "}
                <code className="rounded bg-[hsl(var(--muted))] px-1.5 py-0.5 font-mono text-xs text-[hsl(var(--foreground))]">
                  /登录
                </code>
              </span>
            </li>
            <li className="flex gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--accent))] text-[10px] font-bold text-[hsl(var(--accent-foreground))]">
                3
              </span>
              <span>机器人会私聊发送登录链接</span>
            </li>
            <li className="flex gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--accent))] text-[10px] font-bold text-[hsl(var(--accent-foreground))]">
                4
              </span>
              <span>点击链接即可自动登录</span>
            </li>
          </ol>
        </div>

        {/* Alternative */}
        <div className="mt-4 text-center">
          <a
            href="/verify"
            className="text-xs text-[hsl(var(--muted-foreground))] underline-offset-4 transition-colors hover:text-[hsl(var(--foreground))] hover:underline"
          >
            已有邀请码？手动验证 →
          </a>
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

      {/* Footer */}
      <p className="text-center text-xs text-[hsl(var(--muted-foreground))] opacity-60">
        登录链接有效期 5 分钟，过期请重新获取
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[hsl(var(--primary))] border-t-transparent" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
