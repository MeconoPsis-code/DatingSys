"use client";

interface AlertModalProps {
  open: boolean;
  title: string;
  description: string;
  buttonLabel?: string;
  onConfirm: () => void;
}

export function AlertModal({
  open,
  title,
  description,
  buttonLabel = "我知道了",
  onConfirm,
}: AlertModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal card */}
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-xl">
        {/* Warning Icon + Title */}
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-500">
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-[hsl(var(--foreground))]">
            {title}
          </h3>
        </div>

        {/* Description */}
        <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
          <p className="text-sm leading-relaxed text-amber-600 dark:text-amber-400 font-medium">
            {description}
          </p>
        </div>

        {/* Action Button */}
        <button
          type="button"
          onClick={onConfirm}
          className="w-full rounded-xl bg-brand-blue py-3 text-sm font-semibold text-white shadow-md shadow-brand-blue/20 transition-all hover:scale-[1.01] hover:bg-brand-blue/90 active:scale-[0.99]"
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}
