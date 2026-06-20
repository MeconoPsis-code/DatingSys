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

// ── Core Functions ──────────────────────────────────────

/**
 * Does user A's preferences accept user B's profile?
 * Checks age, height, weight, and attribute.
 */
export function accepts(a: MatchCandidate, b: MatchCandidate): boolean {
  // B must be active
  if (b.profile.status !== "ACTIVE") return false;

  const bAge = ageFromDate(b.profile.birthDate);

  // Age check
  if (bAge < a.preference.ageMin || bAge > a.preference.ageMax) return false;

  // Height check
  if (
    b.profile.heightCm < a.preference.heightMinCm ||
    b.profile.heightCm > a.preference.heightMaxCm
  )
    return false;

  // Weight check
  if (
    b.profile.weightKg < a.preference.weightMinKg ||
    b.profile.weightKg > a.preference.weightMaxKg
  )
    return false;

  // Attribute check
  if (!a.preference.expectedAttributes.includes(b.profile.attribute))
    return false;


  return true;
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

  const aAcceptsB = accepts(a, b);
  const bAcceptsA = accepts(b, a);

  if (aAcceptsB && bAcceptsA) return "mutual";
  if (aAcceptsB && !bAcceptsA) return "one_way_ab"; // A likes B, B doesn't match A's criteria
  if (!aAcceptsB && bAcceptsA) return "one_way_ba"; // B likes A, A doesn't match B's criteria
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
