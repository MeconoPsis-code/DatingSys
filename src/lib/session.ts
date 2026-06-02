import { cookies } from "next/headers";
import { signToken, verifyToken, type JWTPayload } from "@/lib/jwt";
import type { UserRole } from "@prisma/client";

const COOKIE_NAME = "date-session";

/**
 * Create a session: sign JWT and set HTTP-only cookie.
 */
export async function createSession(
  userId: string,
  role: UserRole
): Promise<void> {
  const token = await signToken(userId, role);
  const cookieStore = await cookies();

  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
}

/**
 * Read the session JWT from cookies and verify it.
 * Returns the decoded payload or null if no session / invalid.
 */
export async function getSessionPayload(): Promise<JWTPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) return null;
  return verifyToken(token);
}

/**
 * Destroy the session by clearing the cookie.
 */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
