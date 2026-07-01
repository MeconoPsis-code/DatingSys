import { Attribute } from "@prisma/client";

/**
 * Display labels for Attribute enum values.
 */
export const ATTRIBUTE_LABELS: Record<Attribute, string> = {
  ONE: "1",
  ZERO: "0",
  HALF: "0.5",
  LEAN_ONE: "偏1",
  LEAN_ZERO: "偏0",
  SIDE: "side",
  OTHER: "其他",
};

/**
 * Main attributes (single-select): the primary numeric identity.
 */
export const MAIN_ATTRIBUTES: Attribute[] = [
  "ONE",
  "ZERO",
  "HALF",
  "LEAN_ONE",
  "LEAN_ZERO",
];

/**
 * Main attribute options for form selectors (single-select group).
 */
export const MAIN_ATTRIBUTE_OPTIONS = MAIN_ATTRIBUTES.map((value) => ({
  value,
  label: ATTRIBUTE_LABELS[value],
}));

/**
 * All attribute options for form selectors.
 */
export const ATTRIBUTE_OPTIONS = Object.entries(ATTRIBUTE_LABELS).map(
  ([value, label]) => ({ value: value as Attribute, label })
);

/**
 * Get the display label for an attribute value, with optional isSide/isOther tags.
 */
export function getAttributeLabel(
  attr: Attribute,
  customText?: string | null,
  isSide?: boolean,
  isOther?: boolean,
): string {
  // For legacy OTHER-only records
  if (attr === "OTHER" && customText) return `其他: ${customText}`;

  let label = ATTRIBUTE_LABELS[attr] ?? attr;

  const tags: string[] = [];
  if (isSide && attr !== "SIDE") tags.push("side");
  if (isOther && attr !== "OTHER") tags.push("其他");

  if (tags.length > 0) {
    label += `、${tags.join("、")}`;
  }

  return label;
}
