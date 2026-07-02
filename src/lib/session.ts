import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { signToken, verifyToken, type JWTPayload } from "@/lib/jwt";
import { redis } from "@/lib/redis";
import type { UserRole } from "@prisma/client";

const COOKIE_NAME = "date-session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function activeSessionKey(userId: string): string {
  return `auth:active-session:${userId}`;
}

async function setActiveSession(userId: string, sessionId: string): Promise<void> {
  await redis.set(activeSessionKey(userId), sessionId, "EX", SESSION_MAX_AGE_SECONDS);
}

async function isActiveSession(payload: JWTPayload): Promise<boolean> {
  if (!payload.sid) return false;

  try {
    const activeSessionId = await redis.get(activeSessionKey(payload.sub));
    return activeSessionId === payload.sid;
  } catch (err) {
    console.error("[session] Failed to validate active session:", err);
    return false;
  }
}

async function clearActiveSessionIfCurrent(payload: JWTPayload | null): Promise<void> {
  if (!payload?.sid) return;

  try {
    const key = activeSessionKey(payload.sub);
    const activeSessionId = await redis.get(key);
    if (activeSessionId === payload.sid) {
      await redis.del(key);
    }
  } catch (err) {
    console.error("[session] Failed to clear active session:", err);
  }
}

/**
 * Create a session: sign JWT and set HTTP-only cookie.
 */
export async function createSession(
  userId: string,
  role: UserRole,
  hasProfile: boolean = false,
  options: { sessionId?: string } = {}
): Promise<void> {
  const sessionId = options.sessionId ?? randomUUID();
  const token = await signToken(userId, role, hasProfile, sessionId);
  const cookieStore = await cookies();

  await setActiveSession(userId, sessionId);

  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
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
  const payload = await verifyToken(token);
  if (!payload) return null;

  const active = await isActiveSession(payload);
  return active ? payload : null;
}

/**
 * Destroy the session by clearing the cookie.
 */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (token) {
    await clearActiveSessionIfCurrent(await verifyToken(token));
  }

  cookieStore.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
