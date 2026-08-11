import test from "node:test";
import assert from "node:assert/strict";
import {
  getGroupMembershipSyncAction,
  GROUP_MEMBERSHIP_SYNC_INTERVAL_SECONDS,
  normalizeUsableMembershipStatus,
} from "../src/lib/group-membership-sync";

test("runs full group membership reconciliation every 24 hours", () => {
  assert.equal(GROUP_MEMBERSHIP_SYNC_INTERVAL_SECONDS, 24 * 60 * 60);
});

test("marks a verified or legacy restored account when it is missing from the group", () => {
  assert.equal(getGroupMembershipSyncAction("VERIFIED", false), "MARK_LEFT");
  assert.equal(getGroupMembershipSyncAction("RESTORED", false), "MARK_LEFT");
});

test("restores pending and confirmed leavers after they rejoin", () => {
  assert.equal(getGroupMembershipSyncAction("LEFT_PENDING_REVIEW", true), "RESTORE");
  assert.equal(getGroupMembershipSyncAction("LEFT_CONFIRMED", true), "RESTORE");
  assert.equal(getGroupMembershipSyncAction("RESTORED", true), "RESTORE");
  assert.equal(getGroupMembershipSyncAction("VERIFIED", true), "NONE");
  assert.equal(getGroupMembershipSyncAction("LEFT_PENDING_REVIEW", false), "NONE");
});

test("does not auto-verify pending, rejected, revoked, expired, or removed memberships", () => {
  for (const status of [
    "PENDING",
    "REJECTED",
    "REVOKED",
    "EXPIRED",
    "REMOVED",
  ] as const) {
    assert.equal(getGroupMembershipSyncAction(status, true), "NONE");
  }
});

test("treats legacy RESTORED rows as verified until the daily sync canonicalizes them", () => {
  assert.equal(normalizeUsableMembershipStatus("RESTORED"), "VERIFIED");
  assert.equal(
    normalizeUsableMembershipStatus("LEFT_PENDING_REVIEW"),
    "LEFT_PENDING_REVIEW"
  );
  assert.equal(normalizeUsableMembershipStatus(null), null);
});
