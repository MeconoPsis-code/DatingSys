"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Step = "verify" | "reset";

/**
 * Forgot passcode page — 2-step flow:
 *  Step 1: Enter verification code (obtained via /reset password bot command)
 *  Step 2: Set new passcode
 *
 * The QQ number is resolved from the code via Redis reverse lookup,
 * so users don't need to enter it manually.
 */
export default function ForgotPasscodePage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("verify");

  const [code, setCode] = useState("");
  const [qqNumber, setQqNumber] = useState("");
  const [newPasscode, setNewPasscode] = useState("");
  const [confirmPasscode, setConfirmPasscode] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error?.message || "验证失败");
        return;
      }

      // Store the qqNumber returned from the code lookup
      setQqNumber(data.data.qqNumber);
      setStep("reset");
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPasscode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPasscode !== confirmPasscode) {
      setError("两次输入的密码不一致");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/reset-passcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qqNumber, newPasscode }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error?.message || "重置失败");
        return;
      }

      setSuccess(true);
      setTimeout(() => router.push("/login"), 2000);
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
            重置密码
          </h1>
          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
            {step === "verify" && "输入邮箱收到的验证码"}
            {step === "reset" && "设置你的新密码"}
          </p>
        </div>

        {/* Step indicator */}
        <div className="mb-6 flex items-center justify-center gap-3">
          {(["verify", "reset"] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-3">
              {i > 0 && <div className="h-px w-6 bg-[hsl(var(--border))]" />}
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                  step === s
                    ? "bg-[hsl(var(--primary))] text-white"
                    : (["verify", "reset"].indexOf(step) > i)
                    ? "bg-[hsl(var(--primary))] text-white"
                    : "bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]"
                }`}
              >
                {["verify", "reset"].indexOf(step) > i ? "✓" : i + 1}
              </div>
            </div>
          ))}
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
            ✅ 密码已重置！正在跳转至登录页...
          </div>
        ) : step === "verify" ? (
          <form onSubmit={handleVerifyCode} className="space-y-4">
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
                inputMode="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="请输入 6 位验证码"
                maxLength={6}
                required
                autoFocus
                className="w-full rounded-lg border border-[hsl(var(--input))] bg-transparent px-3 py-2.5 text-center font-mono text-lg tracking-[0.5em] text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] placeholder:tracking-normal placeholder:text-sm focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
              />
            </div>

            <button
              type="submit"
              disabled={loading || code.length < 6}
              className="w-full rounded-lg bg-brand-blue px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-blue/20 transition-all hover:scale-[1.02] hover:bg-brand-blue/90 active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100"
            >
              {loading ? "验证中..." : "验证"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleResetPasscode} className="space-y-4">
            <div className="rounded-lg bg-[hsl(var(--secondary))] px-3 py-2 text-sm text-[hsl(var(--muted-foreground))]">
              QQ 号: <span className="font-mono text-[hsl(var(--foreground))]">{qqNumber}</span>
            </div>

            <div>
              <label
                htmlFor="newPasscode"
                className="mb-1.5 block text-sm font-medium text-[hsl(var(--foreground))]"
              >
                新密码
              </label>
              <input
                id="newPasscode"
                type="password"
                value={newPasscode}
                onChange={(e) => setNewPasscode(e.target.value)}
                placeholder="至少 8 位，包含字母和数字"
                required
                minLength={8}
                autoFocus
                className="w-full rounded-lg border border-[hsl(var(--input))] bg-transparent px-3 py-2.5 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
              />
            </div>

            <div>
              <label
                htmlFor="confirmPasscode"
                className="mb-1.5 block text-sm font-medium text-[hsl(var(--foreground))]"
              >
                确认新密码
              </label>
              <input
                id="confirmPasscode"
                type="password"
                value={confirmPasscode}
                onChange={(e) => setConfirmPasscode(e.target.value)}
                placeholder="请再次输入新密码"
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
              {loading ? "重置中..." : "重置密码"}
            </button>
          </form>
        )}

        {/* Back to login */}
        <div className="mt-6 text-center">
          <a
            href="/login"
            className="text-xs text-[hsl(var(--primary))] underline-offset-4 hover:underline"
          >
            ← 返回登录
          </a>
        </div>
      </div>

      {/* Help card */}
      <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
        <h3 className="mb-2 text-sm font-semibold text-[hsl(var(--foreground))]">
          如何获取验证码？
        </h3>
        <ol className="space-y-1.5 text-xs text-[hsl(var(--muted-foreground))]">
          <li className="flex gap-2">
            <span className="font-mono text-[hsl(var(--primary))]">1.</span>
            在 QQ 群中发送 <code className="rounded bg-[hsl(var(--secondary))] px-1 font-mono">/reset password</code> 指令
          </li>
          <li className="flex gap-2">
            <span className="font-mono text-[hsl(var(--primary))]">2.</span>
            机器人将验证码发送至你的 QQ 邮箱
          </li>
          <li className="flex gap-2">
            <span className="font-mono text-[hsl(var(--primary))]">3.</span>
            在此页面输入验证码并设置新密码
          </li>
        </ol>
      </div>
    </div>
  );
}
