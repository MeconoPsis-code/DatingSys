import { redis } from "@/lib/redis";

const RESEND_DAILY_QUOTA_KEY = "email:resend:daily-quota:first-429-at";
const RESEND_DAILY_QUOTA_WINDOW_SECONDS = 24 * 60 * 60;

function hoursFromSeconds(seconds: number): number {
  return Math.max(1, Math.ceil(seconds / 60 / 60));
}

async function getQuotaTtlSeconds(): Promise<number | null> {
  const ttl = await redis.ttl(RESEND_DAILY_QUOTA_KEY);

  if (ttl > 0) return ttl;
  if (ttl !== -1) return null;

  const rawFirstAt = await redis.get(RESEND_DAILY_QUOTA_KEY);
  const firstAt = rawFirstAt ? Number.parseInt(rawFirstAt, 10) : Number.NaN;
  if (!Number.isFinite(firstAt)) {
    await redis.del(RESEND_DAILY_QUOTA_KEY);
    return null;
  }

  const elapsedSeconds = Math.floor((Date.now() - firstAt) / 1000);
  const remainingSeconds = RESEND_DAILY_QUOTA_WINDOW_SECONDS - elapsedSeconds;
  if (remainingSeconds <= 0) {
    await redis.del(RESEND_DAILY_QUOTA_KEY);
    return null;
  }

  await redis.expire(RESEND_DAILY_QUOTA_KEY, remainingSeconds);
  return remainingSeconds;
}

export async function getResendDailyQuotaRetryAfterHours(): Promise<number | null> {
  const ttl = await getQuotaTtlSeconds();
  return ttl === null ? null : hoursFromSeconds(ttl);
}

export async function markResendDailyQuotaExceeded(): Promise<number> {
  const now = Date.now();
  await redis.set(
    RESEND_DAILY_QUOTA_KEY,
    String(now),
    "EX",
    RESEND_DAILY_QUOTA_WINDOW_SECONDS,
    "NX"
  );

  return (await getResendDailyQuotaRetryAfterHours()) ?? 24;
}

export function buildResendDailyQuotaMessage(retryAfterHours: number): string {
  return `受限于邮箱每日100封的免费额度，今日注册额度已用完，请${retryAfterHours}小时后再次注册。`;
}
