import type { UserStatus } from "@prisma/client";
import { readProfileDraftData } from "@/lib/profile-draft";
import {
  CLEAR_COOLDOWN_DAYS,
  EDIT_COOLDOWN_DAYS,
  PHOTO_REVOKE_REPUBLISH_COOLDOWN_MS,
} from "@/lib/validations/profile";
import { MATCH_PREF_COOLDOWN_MS } from "@/lib/match-pref-cooldown";

export const DAY_MS = 24 * 60 * 60 * 1000;

export const PROFILE_EDIT_COOLDOWN_MS = EDIT_COOLDOWN_DAYS * DAY_MS;
export const DATA_DELETE_COOLDOWN_MS = CLEAR_COOLDOWN_DAYS * DAY_MS;

export const COOLDOWN_CONFIRM_TEXT = "确认解除冷却";

export const USER_COOLDOWN_TYPES = [
  "PROFILE_EDIT",
  "DATA_DELETE",
  "MATCH_POOL",
] as const;

export type UserCooldownType = (typeof USER_COOLDOWN_TYPES)[number];

export type UserCooldownSource =
  | "PROFILE_SUBMIT"
  | "PHOTO_REVOKE"
  | "PROFILE_CLEAR"
  | "ACCOUNT_DELETE"
  | "MATCH_PREF";

export interface UserCooldown {
  type: UserCooldownType;
  label: string;
  releaseLabel: string;
  startedAt: Date;
  endsAt: Date;
  remainingMs: number;
  remainingText: string;
  durationMs: number;
  source: UserCooldownSource;
}

interface CooldownProfileFields {
  lastSubmittedAt: Date | null;
  matchPrefUpdatedAt: Date | null;
  draftData?: unknown;
}

interface CooldownUserFields {
  status: UserStatus | string;
  updatedAt?: Date | null;
  lastProfileClearedAt: Date | null;
  profile?: CooldownProfileFields | null;
  accountDeleteRequestedAt?: Date | null;
}

export const USER_COOLDOWN_META: Record<
  UserCooldownType,
  { label: string; releaseLabel: string }
> = {
  PROFILE_EDIT: {
    label: "修改资料冷却",
    releaseLabel: "解除修改资料冷却",
  },
  DATA_DELETE: {
    label: "删除数据冷却",
    releaseLabel: "解除删除数据冷却",
  },
  MATCH_POOL: {
    label: "修改匹配池冷却",
    releaseLabel: "解除匹配池冷却",
  },
};

export function isUserCooldownType(value: string): value is UserCooldownType {
  return (USER_COOLDOWN_TYPES as readonly string[]).includes(value);
}

export function formatCooldownRemaining(remainingMs: number): string {
  const safeMs = Math.max(0, remainingMs);
  if (safeMs <= 0) return "已到期";

  const totalMinutes = Math.ceil(safeMs / (60 * 1000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    if (hours > 0) return `${days}天 ${hours}小时`;
    return `${days}天`;
  }

  if (hours > 0) {
    if (minutes > 0) return `${hours}小时 ${minutes}分钟`;
    return `${hours}小时`;
  }

  return `${Math.max(1, minutes)}分钟`;
}

function buildCooldown({
  type,
  startedAt,
  durationMs,
  now,
  source,
  keepWhenExpired = false,
}: {
  type: UserCooldownType;
  startedAt: Date | null | undefined;
  durationMs: number;
  now: Date;
  source: UserCooldownSource;
  keepWhenExpired?: boolean;
}): UserCooldown | null {
  if (!startedAt) return null;

  const startsAtTime = startedAt.getTime();
  if (Number.isNaN(startsAtTime)) return null;

  const endsAt = new Date(startsAtTime + durationMs);
  const remainingMs = Math.max(0, endsAt.getTime() - now.getTime());
  if (remainingMs <= 0 && !keepWhenExpired) return null;

  const meta = USER_COOLDOWN_META[type];
  return {
    type,
    label: meta.label,
    releaseLabel: meta.releaseLabel,
    startedAt,
    endsAt,
    remainingMs,
    remainingText: formatCooldownRemaining(remainingMs),
    durationMs,
    source,
  };
}

export function getProfileEditCooldown(
  profile: Pick<CooldownProfileFields, "lastSubmittedAt" | "draftData"> | null | undefined,
  now: Date = new Date(),
): UserCooldown | null {
  if (!profile?.lastSubmittedAt) return null;

  const draftData = readProfileDraftData(profile.draftData);
  const isPhotoRevokeCooldown = Boolean(draftData.photoRevokedAt);

  return buildCooldown({
    type: "PROFILE_EDIT",
    startedAt: profile.lastSubmittedAt,
    durationMs: isPhotoRevokeCooldown
      ? PHOTO_REVOKE_REPUBLISH_COOLDOWN_MS
      : PROFILE_EDIT_COOLDOWN_MS,
    now,
    source: isPhotoRevokeCooldown ? "PHOTO_REVOKE" : "PROFILE_SUBMIT",
  });
}

export function getDataDeleteCooldown(
  startedAt: Date | null | undefined,
  now: Date = new Date(),
): UserCooldown | null {
  return buildCooldown({
    type: "DATA_DELETE",
    startedAt,
    durationMs: DATA_DELETE_COOLDOWN_MS,
    now,
    source: "PROFILE_CLEAR",
  });
}

export function getAccountDeleteCooldown(
  startedAt: Date | null | undefined,
  now: Date = new Date(),
): UserCooldown | null {
  return buildCooldown({
    type: "DATA_DELETE",
    startedAt,
    durationMs: DATA_DELETE_COOLDOWN_MS,
    now,
    source: "ACCOUNT_DELETE",
    keepWhenExpired: true,
  });
}

export function getMatchPoolCooldown(
  profile: Pick<CooldownProfileFields, "matchPrefUpdatedAt"> | null | undefined,
  now: Date = new Date(),
): UserCooldown | null {
  return buildCooldown({
    type: "MATCH_POOL",
    startedAt: profile?.matchPrefUpdatedAt,
    durationMs: MATCH_PREF_COOLDOWN_MS,
    now,
    source: "MATCH_PREF",
  });
}

export function buildActiveUserCooldowns(
  user: CooldownUserFields,
  now: Date = new Date(),
): UserCooldown[] {
  if (user.status === "PENDING_DELETE") {
    const startedAt = user.accountDeleteRequestedAt ?? user.updatedAt ?? now;
    const cooldown = getAccountDeleteCooldown(startedAt, now);
    return cooldown ? [cooldown] : [];
  }

  return [
    getDataDeleteCooldown(user.lastProfileClearedAt, now),
    getProfileEditCooldown(user.profile, now),
    getMatchPoolCooldown(user.profile, now),
  ].filter((cooldown): cooldown is UserCooldown => cooldown !== null);
}
