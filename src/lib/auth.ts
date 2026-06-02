import { db } from "@/lib/db";
import { getSessionPayload } from "@/lib/session";
import { hasRole } from "@/lib/rbac";
import { AppError } from "@/lib/errors";
import type { UserRole, UserStatus, MembershipStatus } from "@prisma/client";

/**
 * Authenticated user returned by getSession / requireAuth.
 */
export interface SessionUser {
  id: string;
  role: UserRole;
  status: UserStatus;
  qqNumber: string | null;
  nickname: string | null;
  membershipStatus: MembershipStatus | null;
  membershipExpiresAt: Date | null;
}

/**
 * Get the current session user with DB-fresh data.
 * Returns null if not logged in or JWT invalid.
 */
export async function getSession(): Promise<SessionUser | null> {
  const payload = await getSessionPayload();
  if (!payload) return null;

  const user = await db.user.findUnique({
    where: { id: payload.sub },
    include: {
      authIdentities: { select: { nickname: true }, take: 1 },
      groupMembership: {
        select: { qqNumber: true, status: true, expiresAt: true },
      },
    },
  });

  if (!user || user.status === "DELETED") return null;

  return {
    id: user.id,
    role: user.role,
    status: user.status,
    qqNumber: user.groupMembership?.qqNumber ?? null,
    nickname: user.authIdentities[0]?.nickname ?? null,
    membershipStatus: user.groupMembership?.status ?? null,
    membershipExpiresAt: user.groupMembership?.expiresAt ?? null,
  };
}

/**
 * Require an authenticated session. Throws 401 if not logged in.
 */
export async function requireAuth(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new AppError("UNAUTHORIZED");
  if (session.status === "FROZEN") throw new AppError("FORBIDDEN", "账号已被冻结");
  if (session.status === "BANNED") throw new AppError("FORBIDDEN", "账号已被封禁");
  return session;
}

/**
 * Require a minimum role. Throws 403 if insufficient.
 */
export async function requireRole(role: UserRole): Promise<SessionUser> {
  const session = await requireAuth();
  if (!hasRole(session.role, role)) throw new AppError("FORBIDDEN");
  return session;
}

/**
 * Require verified group membership. Throws 403 if not verified.
 */
export async function requireVerified(): Promise<SessionUser> {
  const session = await requireAuth();

  if (session.membershipStatus !== "VERIFIED") {
    throw new AppError("PROFILE_NOT_VERIFIED");
  }

  // Check expiry
  if (
    session.membershipExpiresAt &&
    session.membershipExpiresAt < new Date()
  ) {
    throw new AppError("MEMBERSHIP_EXPIRED");
  }

  return session;
}
