import bcrypt from "bcrypt";

const SALT_ROUNDS = 12;

/**
 * Passcode validation rules:
 * - Minimum 8 characters
 * - Must contain at least one letter
 * - Must contain at least one number
 */
export function validatePasscode(passcode: string): {
  valid: boolean;
  message?: string;
} {
  if (passcode.length < 8) {
    return { valid: false, message: "密码至少需要 8 个字符" };
  }

  if (!/[a-zA-Z]/.test(passcode)) {
    return { valid: false, message: "密码必须包含字母" };
  }

  if (!/[0-9]/.test(passcode)) {
    return { valid: false, message: "密码必须包含数字" };
  }

  return { valid: true };
}

/**
 * Hash a plaintext passcode using bcrypt.
 */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

/**
 * Verify a plaintext passcode against a bcrypt hash.
 */
export async function verifyPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
