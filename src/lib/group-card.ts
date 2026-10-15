import { getCities, getProvinceName, isOverseas, PROVINCES } from "@/data/regions";

export interface ParsedGroupCard {
  age: number;
  province: string;
  nickname: string;
}

type GroupCardProfile = {
  birthDate: Date | string;
  provinceCode: string;
  cityCode?: string | null;
};

const CANONICAL_SEPARATOR = "-";
export const QQ_GROUP_CARD_MAX_BYTES = 60;
const GROUP_CARD_ENCODER = new TextEncoder();
const VALID_PROVINCE_CODES = new Set(PROVINCES.map((province) => province.code));
const MUNICIPALITY_CODES = new Set(["110000", "120000", "310000", "500000"]);
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

export function getGroupCardRegionName(provinceCode: string, cityCode?: string | null): string {
  const province = getGroupCardProvinceName(provinceCode);
  if (MUNICIPALITY_CODES.has(provinceCode)) return province;

  // Look up within the selected province so stale or mismatched city codes do
  // not leak raw codes or attach an unrelated city to a valid province.
  const city = getCities(provinceCode).find((candidate) => candidate.code === cityCode);
  if (!city) return province;

  if (isOverseas(provinceCode)) {
    // Overseas "cities" are countries; strip their flag without altering the
    // country name or adding a redundant 海外(...) prefix.
    return city.name.replace(/^[^\u4e00-\u9fffA-Za-z0-9]+/u, "").trim();
  }

  const cityName = city.name.replace(/市$/u, "");
  if ((provinceCode === "810000" || provinceCode === "820000") && cityName === province) return province;
  return `${province}(${cityName})`;
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

export function truncateGroupCardUtf8(value: string, maxBytes = QQ_GROUP_CARD_MAX_BYTES): string {
  let bytes = 0;
  let end = 0;
  // QQ can truncate the UTF-8 payload even when the nickname fits the website's
  // character limit. Keep whole code points in the display card; the canonical
  // website nickname remains untouched.
  for (const character of value) {
    const nextBytes = GROUP_CARD_ENCODER.encode(character).byteLength;
    if (bytes + nextBytes > maxBytes) break;
    bytes += nextBytes;
    end += character.length;
  }
  return value.slice(0, end);
}

export function formatGroupCard(
  age: number,
  province: string,
  nickname: string,
  separator = CANONICAL_SEPARATOR,
): string {
  const normalizedNickname = nickname.trim();
  return truncateGroupCardUtf8([age, normalizeGroupCardProvince(province), normalizedNickname].join(separator));
}

export function buildGroupCardForProfile(
  nickname: string,
  profile: GroupCardProfile | null,
  now: Date = new Date(),
): string {
  const normalizedNickname = nickname.trim();
  // Photo uploads create a temporary main row with province 000000 before the
  // user saves real profile data. Its placeholder birthday is not QQ authority.
  if (!profile || !normalizedNickname || !VALID_PROVINCE_CODES.has(profile.provinceCode)) return truncateGroupCardUtf8(normalizedNickname);

  return formatGroupCard(calculateAge(profile.birthDate, now), getGroupCardRegionName(profile.provinceCode, profile.cityCode), normalizedNickname);
}

export function hasGroupCardSeparator(value: string): boolean {
  return SEPARATOR_PATTERN.test(value);
}
