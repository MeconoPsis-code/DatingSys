/**
 * MBTI personality types — 16 types + unknown.
 */
export const MBTI_TYPES = [
  "INTJ", "INTP", "ENTJ", "ENTP",
  "INFJ", "INFP", "ENFJ", "ENFP",
  "ISTJ", "ISFJ", "ESTJ", "ESFJ",
  "ISTP", "ISFP", "ESTP", "ESFP",
] as const;

export type MbtiType = (typeof MBTI_TYPES)[number];

/**
 * Options for MBTI dropdown (includes "未知" as null sentinel).
 */
export const MBTI_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "未知" },
  ...MBTI_TYPES.map((t) => ({ value: t, label: t })),
];
