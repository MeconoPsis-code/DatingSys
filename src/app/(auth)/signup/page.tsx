"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Step = "verify" | "passcode";

/**
 * Sign-up page — multi-step flow:
 *  Step 1: Enter QQ号 + 验证码 (received via email after bot /signup command)
 *  Step 2: Set passcode
 */
export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("verify");

  // Step 1 state
  const [qqNumber, setQqNumber] = useState("");
  const [code, setCode] = useState("");

  // Step 2 state
  const [passcode, setPasscode] = useState("");
  const [confirmPasscode, setConfirmPasscode] = useState("");

  // Shared state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qqNumber, code }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error?.message || "验证失败");
        return;
      }

      setStep("passcode");
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  async function handleSetPasscode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (passcode !== confirmPasscode) {
      setError("两次输入的密码不一致");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/set-passcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qqNumber, passcode }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error?.message || "设置密码失败");
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
        {/* Header */}
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">
            新用户注册
          </h1>
          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
            {step === "verify"
              ? "输入 QQ 号和邮箱收到的验证码"
              : "设置你的登录密码"}
          </p>
        </div>

        {/* Step indicator */}
        <div className="mb-6 flex items-center justify-center gap-3">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
              step === "verify"
                ? "bg-[hsl(var(--primary))] text-white"
                : "bg-[hsl(var(--primary))] text-white"
            }`}
          >
            {step === "verify" ? "1" : "✓"}
          </div>
          <div className="h-px w-8 bg-[hsl(var(--border))]" />
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
              step === "passcode"
                ? "bg-[hsl(var(--primary))] text-white"
                : "bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]"
            }`}
          >
            2
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg border border-[hsl(0,62%,50%/0.3)] bg-[hsl(0,62%,50%/0.1)] px-4 py-3 text-sm text-[hsl(0,62%,70%)]">
            {error}
          </div>
        )}

        {/* Success */}
        {success ? (
          <div className="rounded-lg border border-[hsl(150,60%,40%/0.3)] bg-[hsl(150,60%,40%/0.1)] px-4 py-3 text-center text-sm text-[hsl(150,60%,60%)]">
            ✅ 注册成功！正在跳转...
          </div>
        ) : step === "verify" ? (
          /* Step 1: Verify email code */
          <form onSubmit={handleVerify} className="space-y-4">
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
                htmlFor="code"
                className="mb-1.5 block text-sm font-medium text-[hsl(var(--foreground))]"
              >
                验证码
              </label>
              <input
                id="code"
                type="text"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="请输入 6 位验证码"
                maxLength={6}
                required
                className="w-full rounded-lg border border-[hsl(var(--input))] bg-transparent px-3 py-2.5 text-center font-mono text-lg tracking-[0.5em] text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] placeholder:tracking-normal placeholder:text-sm focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-brand-blue px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-blue/20 transition-all hover:scale-[1.02] hover:bg-brand-blue/90 active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100"
            >
              {loading ? "验证中..." : "验证邮箱"}
            </button>
          </form>
        ) : (
          /* Step 2: Set passcode */
          <form onSubmit={handleSetPasscode} className="space-y-4">
            <div className="rounded-lg bg-[hsl(var(--secondary))] px-3 py-2 text-sm text-[hsl(var(--muted-foreground))]">
              QQ 号: <span className="font-mono text-[hsl(var(--foreground))]">{qqNumber}</span>
            </div>

            <div>
              <label
                htmlFor="passcode"
                className="mb-1.5 block text-sm font-medium text-[hsl(var(--foreground))]"
              >
                设置密码
              </label>
              <input
                id="passcode"
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="至少 8 位，包含字母和数字"
                required
                minLength={8}
                className="w-full rounded-lg border border-[hsl(var(--input))] bg-transparent px-3 py-2.5 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
              />
            </div>

            <div>
              <label
                htmlFor="confirmPasscode"
                className="mb-1.5 block text-sm font-medium text-[hsl(var(--foreground))]"
              >
                确认密码
              </label>
              <input
                id="confirmPasscode"
                type="password"
                value={confirmPasscode}
                onChange={(e) => setConfirmPasscode(e.target.value)}
                placeholder="请再次输入密码"
                required
                minLength={8}
                className="w-full rounded-lg border border-[hsl(var(--input))] bg-transparent px-3 py-2.5 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
              />
            </div>

            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              密码至少 8 位，需包含字母和数字
            </p>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-brand-blue px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-blue/20 transition-all hover:scale-[1.02] hover:bg-brand-blue/90 active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100"
            >
              {loading ? "注册中..." : "完成注册"}
            </button>
          </form>
        )}

        {/* Footer */}
        <div className="mt-6 text-center">
          <a
            href="/login"
            className="text-xs text-[hsl(var(--primary))] underline-offset-4 hover:underline"
          >
            ← 已有账号？登录
          </a>
        </div>
      </div>

      {/* Help card */}
      <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
        <h3 className="mb-2 text-sm font-semibold text-[hsl(var(--foreground))]">
          📱 注册步骤
        </h3>
        <ol className="space-y-1.5 text-xs text-[hsl(var(--muted-foreground))]">
          <li className="flex gap-2">
            <span className="font-mono text-[hsl(var(--primary))]">1.</span>
            在 QQ 群中发送 <code className="rounded bg-[hsl(var(--secondary))] px-1 font-mono">/signup</code> 指令
          </li>
          <li className="flex gap-2">
            <span className="font-mono text-[hsl(var(--primary))]">2.</span>
            机器人将验证码发送至你的 QQ 邮箱
          </li>
          <li className="flex gap-2">
            <span className="font-mono text-[hsl(var(--primary))]">3.</span>
            在此页面输入 QQ 号和验证码
          </li>
          <li className="flex gap-2">
            <span className="font-mono text-[hsl(var(--primary))]">4.</span>
            设置登录密码，完成注册
          </li>
        </ol>
      </div>
    </div>
  );
}
