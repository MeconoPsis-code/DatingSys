export function calculateBmi(
  heightCm: number | null | undefined,
  weightKg: number | null | undefined,
): number | null {
  if (!heightCm || !weightKg || heightCm <= 0 || weightKg <= 0) {
    return null;
  }

  const heightM = heightCm / 100;
  return weightKg / (heightM * heightM);
}

export function formatBmi(
  heightCm: number | null | undefined,
  weightKg: number | null | undefined,
): string {
  const bmi = calculateBmi(heightCm, weightKg);
  return bmi === null ? "-" : bmi.toFixed(1);
}
