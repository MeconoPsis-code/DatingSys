/**
 * Matching Engine — Pure Functions
 *
 * All functions operate on denormalized MatchCandidate structs.
 * No database calls — inputs must be pre-loaded.
 */

// ── Types ───────────────────────────────────────────────

export interface CandidateProfile {
  birthDate: Date;
  heightCm: number;
  weightKg: number;
  provinceCode: string;
  cityCode: string;
  attribute: string;
  isSide: boolean;
  isOther: boolean;
  status: string;
  photoMatchPref: string | null; // "PHOTO_ONLY" | "ALL" | null
  highScoreOnly: boolean;
}

export interface CandidatePreference {
  ageMin: number;
  ageMax: number;
  heightMinCm: number;
  heightMaxCm: number;
  weightMinKg: number;
  weightMaxKg: number;
  expectedAttributes: string[]; // Array of Attribute enum values
}

export interface MatchCandidate {
  userId: string;
  profile: CandidateProfile;
  preference: CandidatePreference;
  hasPhotos: boolean;
  finalScore: number | null; // from RatingProfile
  lastActiveAt: Date | null; // profile.updatedAt
}

export type MatchType = "mutual" | "one_way_ab" | "one_way_ba" | "none";

const TOTAL_ACCEPTANCE_CRITERIA = 4;
const MIN_PARTIAL_MATCH_CRITERIA_FOR_ONE_WAY = 2;

// ── Helpers ─────────────────────────────────────────────

function ageFromDate(birthDate: Date, referenceDate?: Date): number {
  const today = referenceDate ?? new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

export function getEffectiveAttributes(
  profile: Pick<CandidateProfile, "attribute" | "isSide" | "isOther">
): string[] {
  const attributes = new Set<string>();

  if (profile.attribute) attributes.add(profile.attribute);
  if (profile.isSide) attributes.add("SIDE");
  if (profile.isOther) attributes.add("OTHER");

  return [...attributes];
}

export function profileMatchesExpectedAttributes(
  expectedAttributes: string[],
  profile: Pick<CandidateProfile, "attribute" | "isSide" | "isOther">
): boolean {
  const effectiveAttributes = new Set(getEffectiveAttributes(profile));
  return expectedAttributes.some((attribute) => effectiveAttributes.has(attribute));
}

// ── Core Functions ──────────────────────────────────────

/**
 * Does user A's preferences accept user B's profile?
 * Checks age, height, weight, and attribute.
 */
export function accepts(a: MatchCandidate, b: MatchCandidate): boolean {
  return countAcceptedCriteria(a, b) === TOTAL_ACCEPTANCE_CRITERIA;
}

/**
 * Count how many of user A's preference criteria are met by user B's profile.
 */
export function countAcceptedCriteria(a: MatchCandidate, b: MatchCandidate): number {
  // B must be active
  if (b.profile.status !== "ACTIVE") return 0;

  const bAge = ageFromDate(b.profile.birthDate);
  let matchedCriteria = 0;

  // Age check
  if (bAge >= a.preference.ageMin && bAge <= a.preference.ageMax) {
    matchedCriteria++;
  }

  // Height check
  if (
    b.profile.heightCm >= a.preference.heightMinCm &&
    b.profile.heightCm <= a.preference.heightMaxCm
  )
    matchedCriteria++;

  // Weight check
  if (
    b.profile.weightKg >= a.preference.weightMinKg &&
    b.profile.weightKg <= a.preference.weightMaxKg
  )
    matchedCriteria++;

  // Attribute check
  if (profileMatchesExpectedAttributes(a.preference.expectedAttributes, b.profile)) {
    matchedCriteria++;
  }

  return matchedCriteria;
}

/**
 * Photo visibility rule:
 * - No photos on either side → always visible
 * - Both have photos → always visible
 * - One has photos with PHOTO_ONLY → other must also have photos
 * - One has photos with ALL → visible to everyone
 */
export function photoVisible(a: MatchCandidate, b: MatchCandidate): boolean {
  const aHas = a.hasPhotos;
  const bHas = b.hasPhotos;

  // Neither has photos → OK
  if (!aHas && !bHas) return true;

  // Both have photos → OK
  if (aHas && bHas) return true;

  // A has photos, B doesn't
  if (aHas && !bHas) {
    // If A only wants photo users, B is excluded
    if (a.profile.photoMatchPref === "PHOTO_ONLY") return false;
    // A is "ALL" or null → B can see A
  }

  // B has photos, A doesn't
  if (bHas && !aHas) {
    // If B only wants photo users, A is excluded
    if (b.profile.photoMatchPref === "PHOTO_ONLY") return false;
  }

  return true;
}

/**
 * High-score threshold rule:
 * If a user has highScoreOnly=true AND their own score ≥ 7.0,
 * the other user must also have score ≥ 7.0.
 */
export function passesScoreThreshold(
  a: MatchCandidate,
  b: MatchCandidate
): boolean {
  const THRESHOLD = 7.0;

  // Check A's requirement
  if (
    a.profile.highScoreOnly &&
    a.finalScore !== null &&
    a.finalScore >= THRESHOLD
  ) {
    if (b.finalScore === null || b.finalScore < THRESHOLD) return false;
  }

  // Check B's requirement
  if (
    b.profile.highScoreOnly &&
    b.finalScore !== null &&
    b.finalScore >= THRESHOLD
  ) {
    if (a.finalScore === null || a.finalScore < THRESHOLD) return false;
  }

  return true;
}

/**
 * Determine the match type between two users.
 * Returns: "mutual", "one_way_ab", "one_way_ba", or "none".
 */
export function getMatchType(a: MatchCandidate, b: MatchCandidate): MatchType {
  // Photo visibility and score threshold are symmetric checks
  if (!photoVisible(a, b)) return "none";
  if (!passesScoreThreshold(a, b)) return "none";

  const aMatchesBPreferenceCount = countAcceptedCriteria(b, a);
  const bMatchesAPreferenceCount = countAcceptedCriteria(a, b);
  const aAcceptsB = bMatchesAPreferenceCount === TOTAL_ACCEPTANCE_CRITERIA;
  const bAcceptsA = aMatchesBPreferenceCount === TOTAL_ACCEPTANCE_CRITERIA;

  if (aAcceptsB && bAcceptsA) return "mutual";
  if (
    aAcceptsB &&
    !bAcceptsA &&
    aMatchesBPreferenceCount >= MIN_PARTIAL_MATCH_CRITERIA_FOR_ONE_WAY
  )
    return "one_way_ab"; // B fits A's preferences; A partially fits B's
  if (
    !aAcceptsB &&
    bAcceptsA &&
    bMatchesAPreferenceCount >= MIN_PARTIAL_MATCH_CRITERIA_FOR_ONE_WAY
  )
    return "one_way_ba"; // A fits B's preferences; B partially fits A's
  return "none";
}

/**
 * Compute a relevance score for sorting matches.
 * Higher = better / more relevant.
 */
export function computeRelevanceScore(
  a: MatchCandidate,
  b: MatchCandidate
): number {
  let score = 0;


  // Preference midpoint proximity (how close B is to the center of A's ranges)
  const ageMid = (a.preference.ageMin + a.preference.ageMax) / 2;
  const bAge = ageFromDate(b.profile.birthDate);
  const ageRange = a.preference.ageMax - a.preference.ageMin || 1;
  const ageProximity = 1 - Math.abs(bAge - ageMid) / ageRange;
  score += Math.max(0, ageProximity * 5);

  const heightMid =
    (a.preference.heightMinCm + a.preference.heightMaxCm) / 2;
  const heightRange =
    a.preference.heightMaxCm - a.preference.heightMinCm || 1;
  const heightProximity =
    1 - Math.abs(b.profile.heightCm - heightMid) / heightRange;
  score += Math.max(0, heightProximity * 3);

  const weightMid =
    (a.preference.weightMinKg + a.preference.weightMaxKg) / 2;
  const weightRange =
    a.preference.weightMaxKg - a.preference.weightMinKg || 1;
  const weightProximity =
    1 - Math.abs(b.profile.weightKg - weightMid) / weightRange;
  score += Math.max(0, weightProximity * 2);

  // Recent activity bonus
  if (b.lastActiveAt) {
    const daysSinceActive = Math.floor(
      (Date.now() - b.lastActiveAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSinceActive <= 7) score += 5;
    else if (daysSinceActive <= 30) score += 2;
  }

  return Math.round(score * 100) / 100;
}
