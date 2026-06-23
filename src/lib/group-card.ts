import { getProvinceName } from "@/data/regions";

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
const SEPARATOR_PATTERN = /[-‐‑‒–—―－|｜]/u;
const GROUP_CARD_PATTERN =
  /^\s*(\d{1,3})\s*[-‐‑‒–—―－|｜]\s*([^‐‑‒–—―－|｜-]+?)\s*[-‐‑‒–—―－|｜]\s*(.+?)\s*$/u;

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

export function calculateAge(birthDate: Date | string): number {
  const bd = birthDate instanceof Date ? birthDate : new Date(birthDate);
  if (Number.isNaN(bd.getTime())) return 0;

  const today = new Date();
  let age = today.getFullYear() - bd.getFullYear();
  const monthDiff = today.getMonth() - bd.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < bd.getDate())) {
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
  let nickname = input.trim();

  for (let i = 0; i < 5; i++) {
    const parsed = parseGroupCard(nickname);
    if (!parsed) break;
    nickname = parsed.nickname.trim();
  }

  return nickname;
}

export function formatGroupCard(
  age: number,
  province: string,
  nickname: string,
  separator = CANONICAL_SEPARATOR,
): string {
  const normalizedNickname = normalizeNicknameInput(nickname);
  return [age, normalizeGroupCardProvince(province), normalizedNickname].join(separator);
}

export function buildGroupCardForProfile(
  nickname: string,
  profile: GroupCardProfile | null,
): string {
  const normalizedNickname = normalizeNicknameInput(nickname);
  if (!profile || !normalizedNickname) return normalizedNickname;

  return formatGroupCard(
    calculateAge(profile.birthDate),
    getGroupCardProvinceName(profile.provinceCode),
    normalizedNickname,
  );
}

export function hasGroupCardSeparator(value: string): boolean {
  return SEPARATOR_PATTERN.test(value);
}
