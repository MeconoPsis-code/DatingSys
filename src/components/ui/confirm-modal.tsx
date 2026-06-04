"use client";

import { useState } from "react";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  description: string;
  confirmText: string; // exact text user must type to confirm
  buttonLabel?: string;
  variant?: "danger" | "primary";
  loading?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

/**
 * A strong-confirmation modal that requires the user to type an exact
 * matching string before the action is allowed.
 */
export function ConfirmModal({
  open,
  title,
  description,
  confirmText,
  buttonLabel,
  variant = "primary",
  loading = false,
  onClose,
  onConfirm,
}: ConfirmModalProps) {
  const [input, setInput] = useState("");

  if (!open) return null;

  const isMatch = input === confirmText;

  const btnClass =
    variant === "danger"
      ? "bg-[hsl(var(--destructive))] text-white hover:opacity-90"
      : "bg-gradient-to-r from-[hsl(262,83%,58%)] to-[hsl(290,70%,55%)] text-white shadow-lg shadow-[hsl(262,83%,58%)/0.25] hover:scale-[1.02]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => { if (!loading) { setInput(""); onClose(); } }}
      />

      {/* Modal card */}
      <div className="relative z-10 mx-4 w-full max-w-md rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-xl">
        {/* Icon + Title */}
        <div className="mb-4 flex items-center gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              variant === "danger"
                ? "bg-[hsl(0,62%,50%/0.15)]"
                : "bg-[hsl(262,83%,58%/0.15)]"
            }`}
          >
            <span className="text-lg">{variant === "danger" ? "⚠️" : "✏️"}</span>
          </div>
          <h3 className="text-lg font-semibold text-[hsl(var(--foreground))]">
            {title}
          </h3>
        </div>

        {/* Description */}
        <div
          className={`mb-5 rounded-lg border px-4 py-3 ${
            variant === "danger"
              ? "border-[hsl(0,62%,50%/0.3)] bg-[hsl(0,62%,50%/0.08)]"
              : "border-[hsl(262,83%,58%/0.3)] bg-[hsl(262,83%,58%/0.08)]"
          }`}
        >
          <p
            className={`text-sm ${
              variant === "danger"
                ? "text-[hsl(0,62%,70%)]"
                : "text-[hsl(262,83%,80%)]"
            }`}
          >
            {description}
          </p>
        </div>

        {/* Confirmation input */}
        <div className="mb-5">
          <label className="mb-1.5 block text-sm text-[hsl(var(--muted-foreground))]">
            请输入{" "}
            <span className="font-semibold text-[hsl(var(--foreground))]">
              {confirmText}
            </span>{" "}
            以确认：
          </label>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={confirmText}
            disabled={loading}
            className="w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--card))] px-3 py-2.5 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground)/0.5)] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))] disabled:opacity-50"
          />
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => { setInput(""); onClose(); }}
            disabled={loading}
            className="flex-1 rounded-lg border border-[hsl(var(--border))] px-4 py-2.5 text-sm font-medium text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--secondary))] disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => { onConfirm(); setInput(""); }}
            disabled={!isMatch || loading}
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all disabled:opacity-50 disabled:hover:scale-100 ${btnClass}`}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                处理中...
              </span>
            ) : (
              buttonLabel || "确认"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
