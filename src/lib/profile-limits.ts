export const HEIGHT_MIN_CM = 140;
export const HEIGHT_MAX_CM = 210;
export const HEIGHT_DEFAULT_CM = 170;

export const WEIGHT_MIN_KG = 40;
export const WEIGHT_MAX_KG = 150;
export const WEIGHT_DEFAULT_KG = 60;

export const MAX_SELF_INTRO_LENGTH = 1500;

export function clampInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function boundedNumber(
  value: number | string,
  min: number,
  max: number,
  fallback: number,
) {
  const parsed = typeof value === "number" ? value : Number(value);
  return clampInteger(Number.isFinite(parsed) ? parsed : fallback, min, max);
}
