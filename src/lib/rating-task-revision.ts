export function isValidRatingTaskRevision(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 1;
}
