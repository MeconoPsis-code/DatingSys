import { SignJWT, jwtVerify } from "jose";
import type { UserRole } from "@prisma/client";

export interface JWTPayload {
  sub: string; // user ID
  role: UserRole; // cached role for middleware fast-path
  hasProfile: boolean; // true if user has created a profile
  sid: string; // server-side session id for single-device enforcement
  iat: number;
  exp: number;
}

const getSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET environment variable is not set");
  return new TextEncoder().encode(secret);
};

const DEFAULT_EXPIRY = "7d";

/**
 * Sign a JWT with user ID and role.
 * Uses HS256 — Edge-runtime compatible via jose.
 */
export async function signToken(
  userId: string,
  role: UserRole,
  hasProfile: boolean,
  sessionId: string
): Promise<string> {
  const secret = getSecret();

  return new SignJWT({ role, hp: hasProfile ? 1 : 0, sid: sessionId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(process.env.JWT_EXPIRES_IN || DEFAULT_EXPIRY)
    .sign(secret);
}

/**
 * Verify and decode a JWT.
 * Returns the payload if valid, null if expired/invalid.
 */
export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const subject = payload.sub;
    const sessionId = payload.sid;

    if (!subject || typeof sessionId !== "string") {
      return null;
    }

    return {
      sub: subject,
      role: payload.role as UserRole,
      hasProfile: payload.hp === 1,
      sid: sessionId,
      iat: payload.iat as number,
      exp: payload.exp as number,
    };
  } catch {
    return null;
  }
}
