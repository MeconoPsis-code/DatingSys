"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Fallback membership verification page.
 * Users can enter an admin-issued invite code when the bot flow isn't available.
 */
export default function VerifyPage() {
  const router = useRouter();
  const [qqNumber, setQqNumber] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/membership/submit-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qqNumber, inviteCode }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error?.message || "验证失败");
        return;
      }

      setSuccess(true);
      setTimeout(() => router.push("/profile"), 1500);
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-8">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">
            群成员认证
          </h1>
          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
            输入管理员提供的邀请码完成认证
          </p>
        </div>

        {success ? (
          <div className="rounded-lg border border-[hsl(150,60%,40%/0.3)] bg-[hsl(150,60%,40%/0.1)] px-4 py-3 text-center text-sm text-[hsl(150,60%,60%)]">
            ✅ 认证成功！正在跳转...
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg border border-[hsl(0,62%,50%/0.3)] bg-[hsl(0,62%,50%/0.1)] px-4 py-3 text-sm text-[hsl(0,62%,70%)]">
                {error}
              </div>
            )}

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
                value={qqNumber}
                onChange={(e) => setQqNumber(e.target.value)}
                placeholder="请输入你的 QQ 号"
                required
                className="w-full rounded-lg border border-[hsl(var(--input))] bg-transparent px-3 py-2.5 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
              />
            </div>

            <div>
              <label
                htmlFor="inviteCode"
                className="mb-1.5 block text-sm font-medium text-[hsl(var(--foreground))]"
              >
                邀请码
              </label>
              <input
                id="inviteCode"
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="请输入邀请码"
                required
                className="w-full rounded-lg border border-[hsl(var(--input))] bg-transparent px-3 py-2.5 text-sm font-mono tracking-wider text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-gradient-to-r from-[hsl(262,83%,58%)] to-[hsl(290,70%,55%)] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[hsl(262,83%,58%)/0.25] transition-all hover:scale-[1.02] hover:shadow-xl active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100"
            >
              {loading ? "验证中..." : "提交认证"}
            </button>
          </form>
        )}

        <div className="mt-6 text-center">
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            推荐使用 QQ 群机器人指令{" "}
            <code className="rounded bg-[hsl(var(--secondary))] px-1 py-0.5 font-mono">
              /登录
            </code>{" "}
            自动登录
          </p>
          <a
            href="/login"
            className="mt-2 inline-block text-xs text-[hsl(var(--primary))] underline-offset-4 hover:underline"
          >
            ← 返回登录页
          </a>
        </div>
      </div>
    </div>
  );
}
