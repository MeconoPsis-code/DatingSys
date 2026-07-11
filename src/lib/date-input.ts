const THIRTY_DAY_MONTHS = new Set([4, 6, 9, 11]);

function parseInteger(value: string | number): number | null {
  if (typeof value === "string" && value.trim() === "") return null;

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/**
 * Returns the maximum selectable day for a year/month pair.
 * When the year is not selected yet, February temporarily allows the 29th.
 */
export function getDaysInMonth(
  yearValue: string | number,
  monthValue: string | number
): number {
  const month = parseInteger(monthValue);

  if (month === null || month < 1 || month > 12) return 31;
  if (THIRTY_DAY_MONTHS.has(month)) return 30;
  if (month !== 2) return 31;

  const year = parseInteger(yearValue);
  if (year === null || year < 1) return 29;
  return isLeapYear(year) ? 29 : 28;
}

export function getBirthDayOptions(
  yearValue: string | number,
  monthValue: string | number
): number[] {
  return Array.from(
    { length: getDaysInMonth(yearValue, monthValue) },
    (_, index) => index + 1
  );
}

export function keepValidBirthDay(
  dayValue: string,
  yearValue: string | number,
  monthValue: string | number
): string {
  if (!dayValue) return "";

  const day = parseInteger(dayValue);
  if (day === null || day < 1) return "";
  return day <= getDaysInMonth(yearValue, monthValue) ? dayValue : "";
}

export function isValidCalendarDate(
  yearValue: string | number,
  monthValue: string | number,
  dayValue: string | number
): boolean {
  const year = parseInteger(yearValue);
  const month = parseInteger(monthValue);
  const day = parseInteger(dayValue);

  if (year === null || year < 1 || month === null || day === null || day < 1) {
    return false;
  }

  return month >= 1 && month <= 12 && day <= getDaysInMonth(year, month);
}
