"use client";

import { PROVINCES, getProvinceName } from "@/data/regions";

interface ProvinceFilterSelectProps {
  value: string;
  onChange: (value: string) => void;
}

export function ProvinceFilterSelect({ value, onChange }: ProvinceFilterSelectProps) {
  const selectedLabel = value ? getProvinceName(value) : "全部省份";

  return (
    <label className="relative inline-flex h-9 min-w-[150px] cursor-pointer items-center gap-2 rounded-lg border border-brand-line bg-white/90 px-3 text-xs font-bold text-brand-text shadow-sm transition-all hover:bg-white hover:shadow-md">
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4 shrink-0 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round text-brand-blue"
      >
        <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
      <span className="min-w-0 flex-1 truncate">{selectedLabel}</span>
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4 shrink-0 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round text-brand-muted"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
      <select
        aria-label="按省份筛选匹配"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      >
        <option value="">全部省份</option>
        {PROVINCES.map((province) => (
          <option key={province.code} value={province.code}>
            {province.name}
          </option>
        ))}
      </select>
    </label>
  );
}
