import { SignJWT, jwtVerify, type JWTPayload as JosePayload } from "jose";
import type { UserRole } from "@prisma/client";

export interface JWTPayload {
  sub: string; // user ID
  role: UserRole; // cached role for middleware fast-path
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
export async function signToken(userId: string, role: UserRole): Promise<string> {
  const secret = getSecret();

  return new SignJWT({ role })
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

    return {
      sub: payload.sub as string,
      role: payload.role as UserRole,
      iat: payload.iat as number,
      exp: payload.exp as number,
    };
  } catch {
    return null;
  }
}
