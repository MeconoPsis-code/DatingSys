import { db } from "@/lib/db";

export const DUTY_WEEKDAYS = [
  { value: 1, label: "周一" },
  { value: 2, label: "周二" },
  { value: 3, label: "周三" },
  { value: 4, label: "周四" },
  { value: 5, label: "周五" },
  { value: 6, label: "周六" },
  { value: 7, label: "周日" },
] as const;

export type DutyWeekday = (typeof DUTY_WEEKDAYS)[number]["value"];

export function getChinaDutyWeekday(date = new Date()): DutyWeekday {
  const chinaTime = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const day = chinaTime.getUTCDay();
  return (day === 0 ? 7 : day) as DutyWeekday;
}

export function normalizeDutyWeekdays(value: unknown): DutyWeekday[] {
  if (!Array.isArray(value)) return [];

  const unique = new Set<DutyWeekday>();
  for (const item of value) {
    const weekday = Number(item);
    if (Number.isInteger(weekday) && weekday >= 1 && weekday <= 7) {
      unique.add(weekday as DutyWeekday);
    }
  }

  return Array.from(unique).sort((a, b) => a - b);
}

export async function getOnDutyScorers({
  excludeUserId,
  weekday = getChinaDutyWeekday(),
}: {
  excludeUserId?: string;
  weekday?: DutyWeekday;
} = {}) {
  return db.user.findMany({
    where: {
      role: { in: ["SCORER", "ADMIN"] },
      status: "ACTIVE",
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      dutySchedules: {
        some: { weekday },
      },
    },
    select: { id: true },
  });
}
