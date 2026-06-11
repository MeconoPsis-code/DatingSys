import { UserRole } from "@prisma/client";

/**
 * Role hierarchy — higher weight = more permissions.
 * Each role inherits all permissions of roles below it.
 */
const ROLE_WEIGHT: Record<UserRole, number> = {
  USER: 0,
  SCORER: 1,
  ADMIN: 2,
  SUPER_ADMIN: 3,
};

/**
 * Check if a user's role meets or exceeds the required role.
 * Uses hierarchical inheritance: ADMIN can do everything USER can.
 */
export function hasRole(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_WEIGHT[userRole] >= ROLE_WEIGHT[requiredRole];
}

/**
 * Permission → minimum required role mapping.
 */
export const PERMISSIONS = {
  // User-level
  PROFILE_EDIT: "USER" as UserRole,
  PROFILE_VIEW_OWN: "USER" as UserRole,
  MATCH_VIEW: "USER" as UserRole,
  VIEW_REQUEST_SEND: "USER" as UserRole,
  REPORT_CREATE: "USER" as UserRole,

  // Scorer-level
  SCORE_PHOTO: "SCORER" as UserRole,

  // Admin-level
  MANAGE_USERS: "ADMIN" as UserRole,
  MANAGE_REPORTS: "ADMIN" as UserRole,
  VIEW_AUDIT_LOG: "ADMIN" as UserRole,

  // Super admin-level
  MANAGE_SYSTEM: "SUPER_ADMIN" as UserRole,
  MANAGE_SCORERS: "SUPER_ADMIN" as UserRole,
  MANAGE_ADMINS: "SUPER_ADMIN" as UserRole,
} as const;

export type Permission = keyof typeof PERMISSIONS;

/**
 * Check if a user's role has a specific permission.
 */
export function can(userRole: UserRole, permission: Permission): boolean {
  const requiredRole = PERMISSIONS[permission];
  return hasRole(userRole, requiredRole);
}
