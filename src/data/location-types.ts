import { LocationType } from "@prisma/client";

/**
 * Display labels for LocationType enum values.
 */
export const LOCATION_TYPE_LABELS: Record<LocationType, string> = {
  RESIDENCE: "常住地",
  HOMETOWN: "家乡",
  SCHOOL: "就读地",
  WORK: "工作地",
  TRAVEL: "旅居地",
  OTHER: "其他",
};

/**
 * All location type options for form selectors.
 */
export const LOCATION_TYPE_OPTIONS = Object.entries(LOCATION_TYPE_LABELS).map(
  ([value, label]) => ({ value: value as LocationType, label })
);
