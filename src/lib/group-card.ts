import { getProvinceName, PROVINCES } from "@/data/regions";

export interface ParsedGroupCard {
  age: number;
  province: string;
  nickname: string;
}

type GroupCardProfile = {
  birthDate: Date | string;
  provinceCode: string;
};

const CANONICAL_SEPARATOR = "-";
const VALID_PROVINCE_CODES = new Set(PROVINCES.map((province) => province.code));
const SEPARATOR_PATTERN = /[-‐‑‒–—―－|｜/／]/u;
const GROUP_CARD_PATTERN =
  /^\s*(\d{1,4})\s*[-‐‑‒–—―－|｜/／]\s*([^‐‑‒–—―－|｜/／-]+?)\s*[-‐‑‒–—―－|｜/／]\s*(.*?)\s*$/u;

export function normalizeGroupCardProvince(provinceName: string): string {
  const strippedPrefix = provinceName
    .trim()
    .replace(/^[^\u4e00-\u9fffA-Za-z0-9]+/u, "")
    .trim();

  return strippedPrefix.replace(
    /(壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区|省|市)$/u,
    "",
  );
}

export function getGroupCardProvinceName(provinceCode: string): string {
  return normalizeGroupCardProvince(getProvinceName(provinceCode));
}

export function calculateAge(birthDate: Date | string, now: Date = new Date()): number {
  const bd = birthDate instanceof Date ? birthDate : new Date(birthDate);
  if (Number.isNaN(bd.getTime())) return 0;

  // Birth dates are calendar dates stored at UTC midnight. Shanghai is UTC+8.
  // Using UTC accessors after the fixed offset is independent of host/browser TZ.
  const today = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  let age = today.getUTCFullYear() - bd.getUTCFullYear();
  const monthDiff = today.getUTCMonth() - bd.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getUTCDate() < bd.getUTCDate())) {
    age--;
  }
  return age;
}

export function parseGroupCard(card: string): ParsedGroupCard | null {
  if (!card || typeof card !== "string") return null;

  const match = card.match(GROUP_CARD_PATTERN);
  if (!match) return null;

  const ageStr = match[1].trim();
  const age = Number(ageStr);
  if (!Number.isInteger(age) || age < 1 || age > 120) return null;

  const province = normalizeGroupCardProvince(match[2].trim());
  const nickname = match[3].trim();
  if (!province || !nickname) return null;

  return { age, province, nickname };
}

export function normalizeNicknameInput(input: string): string {
  // Structural recognition is separate from validation of age/province. Invalid
  // QQ prefixes are corrected from the website rather than stored as a nickname.
  // Only strip one prefix: the nickname itself may look like a group card.
  const match = input.trim().match(GROUP_CARD_PATTERN);
  return match ? match[3].trim() : input.trim();
}

export function isValidGroupCardNickname(nickname: string): boolean {
  return nickname.trim().length > 0 && nickname.length <= 30;
}

export function formatGroupCard(
  age: number,
  province: string,
  nickname: string,
  separator = CANONICAL_SEPARATOR,
): string {
  const normalizedNickname = nickname.trim();
  return [age, normalizeGroupCardProvince(province), normalizedNickname].join(separator);
}

export function buildGroupCardForProfile(
  nickname: string,
  profile: GroupCardProfile | null,
  now: Date = new Date(),
): string {
  const normalizedNickname = nickname.trim();
  // Photo uploads create a temporary main row with province 000000 before the
  // user saves real profile data. Its placeholder birthday is not QQ authority.
  if (!profile || !normalizedNickname || !VALID_PROVINCE_CODES.has(profile.provinceCode)) return normalizedNickname;

  return [calculateAge(profile.birthDate, now), getGroupCardProvinceName(profile.provinceCode), normalizedNickname].join(CANONICAL_SEPARATOR);
}

export function hasGroupCardSeparator(value: string): boolean {
  return SEPARATOR_PATTERN.test(value);
}
