export const MATCH_PREF_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export function getMatchPrefCooldown(
  lastChangedAt: Date | string | null | undefined,
  now: Date = new Date()
) {
  if (!lastChangedAt) {
    return {
      isActive: false,
      nextChangeAt: null,
      remainingMs: 0,
    };
  }

  const changedAt =
    lastChangedAt instanceof Date ? lastChangedAt : new Date(lastChangedAt);

  if (Number.isNaN(changedAt.getTime())) {
    return {
      isActive: false,
      nextChangeAt: null,
      remainingMs: 0,
    };
  }

  const nextChangeAt = new Date(changedAt.getTime() + MATCH_PREF_COOLDOWN_MS);
  const remainingMs = Math.max(0, nextChangeAt.getTime() - now.getTime());

  return {
    isActive: remainingMs > 0,
    nextChangeAt,
    remainingMs,
  };
}

export function formatMatchPrefCooldownRemaining(remainingMs: number): string {
  const minutes = Math.max(1, Math.ceil(remainingMs / (60 * 1000)));
  const hours = Math.floor(minutes / 60);
  const leftoverMinutes = minutes % 60;

  if (hours <= 0) return `${minutes} 分钟`;
  if (leftoverMinutes === 0) return `${hours} 小时`;
  return `${hours} 小时 ${leftoverMinutes} 分钟`;
}
