"use client";

import { useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { Minus, Plus } from "lucide-react";

interface NumberStepperInputProps {
  value: number | string;
  min: number;
  max: number;
  fallbackValue: number;
  onCommit: (value: number) => void;
  ariaLabel: string;
  unit?: string;
  detail?: (value: number) => ReactNode;
  step?: number;
  className?: string;
}

function stepPrecision(step: number) {
  const text = String(step);
  if (text.includes("e-")) {
    return Number(text.split("e-")[1]) || 0;
  }
  return text.split(".")[1]?.length ?? 0;
}

function clampToStep(value: number, min: number, max: number, step: number) {
  const precision = stepPrecision(step);
  const stepped = min + Math.round((value - min) / step) * step;
  const clamped = Math.min(max, Math.max(min, stepped));
  return Number(clamped.toFixed(precision));
}

function formatDraftValue(value: number, step: number) {
  const precision = stepPrecision(step);
  return precision > 0 ? value.toFixed(precision) : String(value);
}

export function NumberStepperInput({
  value,
  min,
  max,
  fallbackValue,
  onCommit,
  ariaLabel,
  unit,
  detail,
  step = 1,
  className = "",
}: NumberStepperInputProps) {
  const currentValue = useMemo(
    () => {
      const parsed = typeof value === "number" ? value : Number(value);
      return clampToStep(
        Number.isFinite(parsed) ? parsed : fallbackValue,
        min,
        max,
        step,
      );
    },
    [fallbackValue, max, min, step, value],
  );
  const [draftState, setDraftState] = useState<{
    sourceValue: number;
    draft: string;
  } | null>(null);
  const draft =
    draftState?.sourceValue === currentValue
      ? draftState.draft
      : formatDraftValue(currentValue, step);

  function updateDraft(nextDraft: string) {
    setDraftState({ sourceValue: currentValue, draft: nextDraft });
  }

  function commitDraft(nextDraft = draft) {
    const parsed = Number(nextDraft);
    const nextValue = clampToStep(
      Number.isFinite(parsed) ? parsed : currentValue,
      min,
      max,
      step,
    );
    setDraftState(null);
    onCommit(nextValue);
  }

  function stepBy(delta: number) {
    const nextValue = clampToStep(currentValue + delta, min, max, step);
    setDraftState(null);
    onCommit(nextValue);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    }
  }

  return (
    <div
      className={`inline-flex max-w-full flex-nowrap items-center gap-1 bg-transparent sm:gap-1 ${className}`}
    >
      <button
        type="button"
        aria-label={`减少${ariaLabel}`}
        disabled={currentValue <= min}
        onClick={() => stepBy(-step)}
        className="flex h-8 w-6 shrink-0 items-center justify-center rounded-md text-brand-blue transition-all hover:bg-blue-1 disabled:pointer-events-none disabled:text-brand-muted/50 sm:w-8"
      >
        <Minus className="h-4 w-4 stroke-[3] sm:stroke-2" />
      </button>
      <div className="flex h-8 shrink-0 items-center rounded-md bg-slate-50/70 px-1.5 ring-1 ring-brand-line/70 sm:px-2">
        <input
          type="number"
          inputMode={stepPrecision(step) > 0 ? "decimal" : "numeric"}
          min={min}
          max={max}
          step={step}
          value={draft}
          aria-label={ariaLabel}
          onChange={(e) => updateDraft(e.target.value)}
          onBlur={() => commitDraft()}
          onKeyDown={handleKeyDown}
          className="h-full w-[3.25ch] bg-transparent text-center text-[13px] font-bold tabular-nums text-brand-blue outline-none [appearance:textfield] sm:w-14 sm:text-sm [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        {unit && (
          <span className="ml-1 shrink-0 text-[9px] font-bold leading-none text-brand-blue sm:text-xs">{unit}</span>
        )}
      </div>
      {detail && (
        <span className="whitespace-nowrap px-0.5 text-[10px] font-semibold tabular-nums text-brand-muted sm:px-1 sm:text-xs">
          {detail(currentValue)}
        </span>
      )}
      <button
        type="button"
        aria-label={`增加${ariaLabel}`}
        disabled={currentValue >= max}
        onClick={() => stepBy(step)}
        className="flex h-8 w-6 shrink-0 items-center justify-center rounded-md text-brand-blue transition-all hover:bg-blue-1 disabled:pointer-events-none disabled:text-brand-muted/50 sm:w-8"
      >
        <Plus className="h-4 w-4 stroke-[3] sm:stroke-2" />
      </button>
    </div>
  );
}
