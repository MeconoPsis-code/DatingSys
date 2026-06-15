"use client";

import { useCallback } from "react";

interface DualRangeSliderProps {
  min: number;
  max: number;
  step?: number;
  valueMin: number;
  valueMax: number;
  onChangeMin: (v: number) => void;
  onChangeMax: (v: number) => void;
  formatValue?: (v: number) => string;
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
}: DualRangeSliderProps) {
  const pctMin = ((valueMin - min) / (max - min)) * 100;
  const pctMax = ((valueMax - min) / (max - min)) * 100;

  const handleMinChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = Number(e.target.value);
      onChangeMin(Math.min(val, valueMax));
    },
    [valueMax, onChangeMin]
  );

  const handleMaxChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = Number(e.target.value);
      onChangeMax(Math.max(val, valueMin));
    },
    [valueMin, onChangeMax]
  );

  return (
    <div>
      {/* Value labels */}
      <div className="mb-2 flex items-center justify-between">
        <span className="tabular-nums text-sm font-semibold text-[hsl(var(--primary))]">
          {formatValue(valueMin)}
        </span>
        <span className="text-xs text-[hsl(var(--muted-foreground))]">~</span>
        <span className="tabular-nums text-sm font-semibold text-[hsl(var(--primary))]">
          {formatValue(valueMax)}
        </span>
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
          value={valueMin}
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
          value={valueMax}
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
