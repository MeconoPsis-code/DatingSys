import type { MembershipStatus } from "@prisma/client";

export const GROUP_MEMBERSHIP_SYNC_INTERVAL_SECONDS = 24 * 60 * 60;

export type GroupMembershipSyncAction = "NONE" | "MARK_LEFT" | "RESTORE";

/**
 * Decide how a linked website membership should be reconciled against the
 * latest complete QQ group member list.
 */
export function getGroupMembershipSyncAction(
  status: MembershipStatus,
  isInGroup: boolean
): GroupMembershipSyncAction {
  if (status === "VERIFIED" || status === "RESTORED") {
    return isInGroup ? (status === "RESTORED" ? "RESTORE" : "NONE") : "MARK_LEFT";
  }

  if (status === "LEFT_PENDING_REVIEW" || status === "LEFT_CONFIRMED") {
    return isInGroup ? "RESTORE" : "NONE";
  }

  return "NONE";
}

/**
 * RESTORED is a legacy transitional status. Treat it as verified while the
 * daily reconciliation job canonicalizes the database row to VERIFIED.
 */
export function normalizeUsableMembershipStatus(
  status: MembershipStatus | null
): MembershipStatus | null {
  return status === "RESTORED" ? "VERIFIED" : status;
}
