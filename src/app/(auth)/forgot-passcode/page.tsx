"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Step = "request" | "verify" | "reset";

/**
 * Forgot passcode page — 3-step flow:
 *  Step 1: Enter QQ号 → request verification code
 *  Step 2: Enter verification code
 *  Step 3: Set new passcode
 */
export default function ForgotPasscodePage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("request");

  const [qqNumber, setQqNumber] = useState("");
  const [code, setCode] = useState("");
  const [newPasscode, setNewPasscode] = useState("");
  const [confirmPasscode, setConfirmPasscode] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  function startCooldown() {
    setCooldown(60);
    const timer = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function handleRequestCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/forgot-passcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qqNumber }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error?.message || "发送失败");
        return;
      }

      startCooldown();
      setStep("verify");
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
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
            {step === "request" && "输入你的 QQ 号，我们将发送验证码至邮箱"}
            {step === "verify" && "输入邮箱收到的验证码"}
            {step === "reset" && "设置你的新密码"}
          </p>
        </div>

        {/* Step indicator */}
        <div className="mb-6 flex items-center justify-center gap-3">
          {(["request", "verify", "reset"] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-3">
              {i > 0 && <div className="h-px w-6 bg-[hsl(var(--border))]" />}
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                  step === s
                    ? "bg-[hsl(var(--primary))] text-white"
                    : (["request", "verify", "reset"].indexOf(step) > i)
                    ? "bg-[hsl(var(--primary))] text-white"
                    : "bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]"
                }`}
              >
                {["request", "verify", "reset"].indexOf(step) > i ? "✓" : i + 1}
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
        ) : step === "request" ? (
          <form onSubmit={handleRequestCode} className="space-y-4">
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

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-gradient-to-r from-[hsl(262,83%,58%)] to-[hsl(290,70%,55%)] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[hsl(262,83%,58%)/0.25] transition-all hover:scale-[1.02] hover:shadow-xl active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100"
            >
              {loading ? "发送中..." : "发送验证码"}
            </button>
          </form>
        ) : step === "verify" ? (
          <form onSubmit={handleVerifyCode} className="space-y-4">
            <div className="rounded-lg bg-[hsl(var(--secondary))] px-3 py-2 text-sm text-[hsl(var(--muted-foreground))]">
              验证码已发送至 <span className="font-mono text-[hsl(var(--foreground))]">{qqNumber}@qq.com</span>
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
              className="w-full rounded-lg bg-gradient-to-r from-[hsl(262,83%,58%)] to-[hsl(290,70%,55%)] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[hsl(262,83%,58%)/0.25] transition-all hover:scale-[1.02] hover:shadow-xl active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100"
            >
              {loading ? "验证中..." : "验证"}
            </button>

            <button
              type="button"
              disabled={cooldown > 0}
              onClick={() => handleRequestCode({preventDefault: () => {}} as React.FormEvent)}
              className="w-full rounded-lg border border-[hsl(var(--border))] px-4 py-2 text-xs text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--secondary))] disabled:opacity-50"
            >
              {cooldown > 0 ? `重新发送 (${cooldown}s)` : "重新发送验证码"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleResetPasscode} className="space-y-4">
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
              className="w-full rounded-lg bg-gradient-to-r from-[hsl(262,83%,58%)] to-[hsl(290,70%,55%)] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[hsl(262,83%,58%)/0.25] transition-all hover:scale-[1.02] hover:shadow-xl active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100"
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
    </div>
  );
}
