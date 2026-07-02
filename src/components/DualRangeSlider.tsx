"use client";

import { useCallback } from "react";
import { NumberStepperInput } from "@/components/NumberStepperInput";
import { boundedNumber, clampInteger } from "@/lib/profile-limits";

interface DualRangeSliderProps {
  min: number;
  max: number;
  step?: number;
  valueMin: number;
  valueMax: number;
  onChangeMin: (v: number) => void;
  onChangeMax: (v: number) => void;
  formatValue?: (v: number) => string;
  unit?: string;
  detail?: (v: number) => string;
  minAriaLabel?: string;
  maxAriaLabel?: string;
}

/**
 * Dual-thumb range slider using two overlapping native range inputs.
 */
export function DualRangeSlider({
  min,
  max,
  step = 1,
  valueMin,
  valueMax,
  onChangeMin,
  onChangeMax,
  formatValue = String,
  unit,
  detail,
  minAriaLabel = "最小值",
  maxAriaLabel = "最大值",
}: DualRangeSliderProps) {
  const boundedMin = boundedNumber(valueMin, min, max, min);
  const boundedMax = boundedNumber(valueMax, min, max, max);
  const safeValueMin = Math.min(boundedMin, boundedMax);
  const safeValueMax = Math.max(boundedMin, boundedMax);
  const pctMin = ((safeValueMin - min) / (max - min)) * 100;
  const pctMax = ((safeValueMax - min) / (max - min)) * 100;

  const commitMin = useCallback(
    (nextValue: number) => {
      const boundedValue = clampInteger(nextValue, min, safeValueMax);
      onChangeMin(boundedValue);
    },
    [min, onChangeMin, safeValueMax],
  );

  const commitMax = useCallback(
    (nextValue: number) => {
      const boundedValue = clampInteger(nextValue, safeValueMin, max);
      onChangeMax(boundedValue);
    },
    [max, onChangeMax, safeValueMin],
  );

  const handleMinChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = Number(e.target.value);
      commitMin(val);
    },
    [commitMin],
  );

  const handleMaxChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = Number(e.target.value);
      commitMax(val);
    },
    [commitMax],
  );

  return (
    <div>
      {/* Value labels */}
      <div
        className="mb-2 grid items-center gap-0 sm:gap-2"
        style={{ gridTemplateColumns: "minmax(0, 1fr) 1.5rem minmax(0, 1fr)" }}
      >
        <div className="flex min-w-0 justify-start">
          <NumberStepperInput
            className="justify-start"
            value={safeValueMin}
            min={min}
            max={safeValueMax}
            fallbackValue={min}
            onCommit={commitMin}
            ariaLabel={minAriaLabel}
            unit={unit}
            detail={detail}
          />
        </div>
        <span className="flex h-10 items-center justify-center text-sm font-semibold leading-none text-[hsl(var(--muted-foreground))] sm:text-xl">
          <span className="sm:hidden">至</span>
          <span className="hidden sm:inline">—</span>
        </span>
        <div className="flex min-w-0 justify-end">
          <NumberStepperInput
            className="justify-end"
            value={safeValueMax}
            min={safeValueMin}
            max={max}
            fallbackValue={max}
            onCommit={commitMax}
            ariaLabel={maxAriaLabel}
            unit={unit}
            detail={detail}
          />
        </div>
      </div>

      {/* Dual range track */}
      <div className="dual-range-container">
        {/* Gray background track */}
        <div className="dual-range-track" />
        {/* Filled segment between thumbs */}
        <div
          className="dual-range-fill"
          style={{ left: `${pctMin}%`, right: `${100 - pctMax}%` }}
        />
        {/* Min thumb input */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={safeValueMin}
          onChange={handleMinChange}
          className="dual-range-input"
          style={{ zIndex: pctMin > 50 ? 5 : 3 }}
        />
        {/* Max thumb input */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={safeValueMax}
          onChange={handleMaxChange}
          className="dual-range-input"
          style={{ zIndex: pctMax < 50 ? 5 : 4 }}
        />
      </div>

      {/* Edge labels */}
      <div className="mt-1 flex justify-between text-[10px] text-[hsl(var(--muted-foreground))]">
        <span>{formatValue(min)}</span>
        <span>{formatValue(max)}</span>
      </div>
    </div>
  );
}
