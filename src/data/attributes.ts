import { Attribute } from "@prisma/client";

/**
 * Display labels for Attribute enum values.
 */
export const ATTRIBUTE_LABELS: Record<Attribute, string> = {
  ONE: "1",
  ZERO: "0",
  HALF: "0.5",
  LEAN_ONE: "0.5偏1",
  LEAN_ZERO: "0.5偏0",
  SIDE: "side",
  OTHER: "其他",
};

/**
 * All attribute options for form selectors.
 */
export const ATTRIBUTE_OPTIONS = Object.entries(ATTRIBUTE_LABELS).map(
  ([value, label]) => ({ value: value as Attribute, label })
);

/**
 * Get the display label for an attribute value.
 * For OTHER, returns customAttribute text if provided.
 */
export function getAttributeLabel(attr: Attribute, customText?: string | null): string {
  if (attr === "OTHER" && customText) return `其他: ${customText}`;
  return ATTRIBUTE_LABELS[attr] ?? attr;
}
