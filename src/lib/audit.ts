import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

/**
 * Audit action constants — used as the `action` field in audit_logs table.
 */
export const AUDIT_ACTIONS = {
  LOGIN: "LOGIN",
  LOGOUT: "LOGOUT",
  DEV_LOGIN: "DEV_LOGIN",
  BOT_TOKEN_ISSUED: "BOT_TOKEN_ISSUED",
  INVITE_CREATE: "INVITE_CREATE",
  INVITE_USE: "INVITE_USE",
  INVITE_REVOKE: "INVITE_REVOKE",
  MEMBERSHIP_VERIFY: "MEMBERSHIP_VERIFY",
  MEMBERSHIP_EXPIRE: "MEMBERSHIP_EXPIRE",
  PROFILE_UPDATE: "PROFILE_UPDATE",
  PROFILE_CLEAR: "PROFILE_CLEAR",
  RATING_SUBMIT: "RATING_SUBMIT",
  REPORT_CREATE: "REPORT_CREATE",
  PENALTY_CREATE: "PENALTY_CREATE",
  ROLE_CHANGE: "ROLE_CHANGE",
  PASSCODE_RESET: "PASSCODE_RESET",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

interface AuditParams {
  actorId?: string | null;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  metadata?: Prisma.InputJsonValue;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Write an immutable audit log entry.
 * Non-blocking — errors are logged but do not throw.
 */
export async function logAudit(params: AuditParams): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        actorUserId: params.actorId ?? null,
        action: params.action,
        targetType: params.targetType ?? null,
        targetId: params.targetId ?? null,
        metadata: params.metadata ?? undefined,
        ip: params.ip ?? null,
        userAgent: params.userAgent ?? null,
      },
    });
  } catch (err) {
    // Audit logging should never break the main flow
    console.error("[Audit] Failed to write log:", err);
  }
}

/**
 * Extract client IP from request headers.
 */
export function getClientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? null;
}
