"use client";

import { NumberStepperInput } from "@/components/NumberStepperInput";
import { boundedNumber } from "@/lib/profile-limits";

interface MeasurementSliderProps {
  label: string;
  value: string;
  min: number;
  max: number;
  defaultValue: number;
  unit: string;
  onChange: (value: string) => void;
  required?: boolean;
  detail?: (value: number) => string;
  className?: string;
}

export function MeasurementSlider({
  label,
  value,
  min,
  max,
  defaultValue,
  unit,
  onChange,
  required = false,
  detail,
  className = "",
}: MeasurementSliderProps) {
  const boundedValue = boundedNumber(value, min, max, defaultValue);

  function commitValue(nextValue: number) {
    onChange(String(nextValue));
  }

  return (
    <div className={className}>
      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label className="text-sm font-medium text-[hsl(var(--foreground))]">
          {label}
          {required && (
            <span className="ml-1 text-[hsl(var(--destructive))]">*</span>
          )}
        </label>
        <NumberStepperInput
          value={value}
          min={min}
          max={max}
          fallbackValue={defaultValue}
          unit={unit}
          detail={detail}
          ariaLabel={label}
          onCommit={commitValue}
        />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={boundedValue}
        onChange={(e) => commitValue(Number(e.target.value))}
        className="slider-input w-full"
      />
      <div className="mt-1 flex justify-between text-[10px] font-medium text-[hsl(var(--muted-foreground))]">
        <span>
          {min} {unit}
        </span>
        <span>
          {max} {unit}
        </span>
      </div>
    </div>
  );
}
