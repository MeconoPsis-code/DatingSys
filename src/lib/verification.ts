import { redis } from "@/lib/redis";
import crypto from "crypto";

const CODE_TTL = 600; // 10 minutes
const RATE_LIMIT_TTL = 60; // 1 code per 60 seconds
const VERIFIED_TTL = 900; // 15 minutes to complete passcode setup

/**
 * Generate a 6-digit verification code and store in Redis.
 * Returns the code string.
 */
export async function generateAndStoreCode(qqNumber: string): Promise<string> {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const code = Array.from({ length: 6 }, () => chars[crypto.randomInt(chars.length)]).join("");
  const key = `auth:verify:${qqNumber}`;

  await redis.setex(key, CODE_TTL, code);

  // Reverse mapping: code → qqNumber (so user only needs to enter the code)
  const reverseKey = `auth:code-lookup:${code}`;
  await redis.setex(reverseKey, CODE_TTL, qqNumber);

  // Set rate limit flag
  const rateKey = `auth:rate:${qqNumber}`;
  await redis.setex(rateKey, RATE_LIMIT_TTL, "1");

  return code;
}

/**
 * Validate a verification code (requires qqNumber).
 * On success: deletes the code (one-time use) and sets a "verified" flag.
 * Returns true if the code matches.
 */
export async function validateCode(
  qqNumber: string,
  code: string
): Promise<boolean> {
  const key = `auth:verify:${qqNumber}`;
  const stored = await redis.get(key);

  if (!stored || stored !== code) return false;

  // Delete the code and reverse mapping (one-time use)
  await redis.del(key);
  await redis.del(`auth:code-lookup:${code}`);

  // Set "verified" flag — user has 15min to set passcode
  const verifiedKey = `auth:verified:${qqNumber}`;
  await redis.setex(verifiedKey, VERIFIED_TTL, "1");

  return true;
}

/**
 * Validate a verification code using only the code (no qqNumber needed).
 * Looks up the qqNumber from the reverse mapping in Redis.
 * On success: returns the qqNumber. On failure: returns null.
 */
export async function validateCodeOnly(
  code: string
): Promise<string | null> {
  const normalizedCode = code.trim().toUpperCase();
  const reverseKey = `auth:code-lookup:${normalizedCode}`;
  const qqNumber = await redis.get(reverseKey);

  if (!qqNumber) return null;

  // Validate against the forward mapping to ensure consistency
  const key = `auth:verify:${qqNumber}`;
  const stored = await redis.get(key);

  if (!stored || stored !== normalizedCode) return null;

  // Delete the code and reverse mapping (one-time use)
  await redis.del(key);
  await redis.del(reverseKey);

  // Set "verified" flag — user has 15min to set passcode
  const verifiedKey = `auth:verified:${qqNumber}`;
  await redis.setex(verifiedKey, VERIFIED_TTL, "1");

  return qqNumber;
}

/**
 * Check if a QQ number has been verified (email code confirmed).
 * Consumes the flag on read (one-time use).
 */
export async function consumeVerifiedFlag(
  qqNumber: string
): Promise<boolean> {
  const key = `auth:verified:${qqNumber}`;
  const result = await redis.get(key);

  if (!result) return false;

  await redis.del(key);
  return true;
}

/**
 * Check if a QQ number is rate-limited for verification codes.
 * Returns true if they should wait before requesting another code.
 */
export async function isRateLimited(qqNumber: string): Promise<boolean> {
  const key = `auth:rate:${qqNumber}`;
  const result = await redis.get(key);
  return result !== null;
}
