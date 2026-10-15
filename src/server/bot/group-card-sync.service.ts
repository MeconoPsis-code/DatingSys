import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { lockRatingUserTasks } from "@/lib/rating-profile-sync";
import { buildGroupCardForProfile, isValidGroupCardNickname, normalizeNicknameInput } from "@/lib/group-card";
import { aggregateGroupCardSyncStatus, groupCardSyncMode, groupCardSyncReason, type GroupCardSyncStatus, type GroupCardSyncSummary } from "@/lib/group-card-sync";
import type { GroupCardSyncRepository, SyncUserSnapshot, SyncDecision, SyncFinishAttempt } from "./group-card-sync.types";

type Tx = Prisma.TransactionClient;
export interface QueueGroupCardSyncOptions {
  nickname?: string | null;
  baseNicknameRevision?: number;
  source?: string;
  sourceGroupId?: string;
  force?: boolean;
  workspaceId?: string;
  initialize?: boolean;
  baselineCard?: string;
  baselineGroupId?: string;
  now?: Date;
}
export class NicknameRevisionConflictError extends Error {
  readonly status = 409;
  constructor(public readonly currentNickname: string | null, public readonly currentRevision: number) {
    super("昵称已在另一端更新，请确认当前昵称后重试");
  }
}
const operational = (w: { status: string; expiresAt: Date | null; botEnabled: boolean }, now: Date) =>
  w.status === "ACTIVE" && w.botEnabled && (!w.expiresAt || w.expiresAt > now);
const loadUser = (tx: Tx, userId: string) => tx.user.findUnique({
  where: { id: userId },
  include: {
    profile: { select: { birthDate: true, provinceCode: true, cityCode: true } },
    authIdentities: { select: { id: true, provider: true, nickname: true }, orderBy: { createdAt: "asc" } },
    workspaceMembers: { where: { leftAt: null }, include: { workspace: true } },
  },
});
function canonicalNickname(identities: Array<{ provider: string; nickname: string | null }>): string | null {
  return identities.find((identity) => identity.provider === "qq_bot")?.nickname ?? identities[0]?.nickname ?? null;
}
async function botOpen(tx: Tx): Promise<boolean> {
  const setting = await tx.systemConfig.findUnique({ where: { key: "botOpen" } });
  return typeof setting?.value === "boolean" ? setting.value : true;
}
async function ensureControl(tx: Tx, userId: string) {
  return tx.userNicknameSync.upsert({ where: { userId }, create: { userId }, update: {} });
}

/** Atomic website mutation + coalesced durable outbox. Never calls QQ. */
export async function queueGroupCardSyncInTransaction(tx: Tx, userId: string, options: QueueGroupCardSyncOptions = {}) {
  const now = options.now ?? new Date();
  await lockRatingUserTasks(tx, userId);
  const user = await loadUser(tx, userId);
  if (!user || user.status === "DELETED") throw new AppError("NOT_FOUND", "用户不存在");
  const control = await ensureControl(tx, userId);
  const previousNickname = canonicalNickname(user.authIdentities);
  if (options.baseNicknameRevision !== undefined && options.baseNicknameRevision !== control.nicknameRevision) {
    throw new NicknameRevisionConflictError(previousNickname, control.nicknameRevision);
  }
  const supplied = typeof options.nickname === "string";
  const nickname = supplied
    ? (options.source === "qq" || options.nickname!.trim() === previousNickname ? options.nickname!.trim() : normalizeNicknameInput(options.nickname!))
    : previousNickname;
  if (supplied && !isValidGroupCardNickname(nickname ?? "")) {
    throw new AppError("VALIDATION_ERROR", "昵称长度需在 1-30 个字符之间");
  }
  if (supplied && user.authIdentities.length === 0) {
    throw new AppError("VALIDATION_ERROR", "账号尚未绑定昵称身份");
  }
  const desiredCard = buildGroupCardForProfile(nickname ?? "", user.profile, now);
  const fingerprint = JSON.stringify([user.profile?.birthDate.toISOString().slice(0, 10) ?? null, user.profile?.provinceCode ?? null, desiredCard, user.profile?.cityCode ?? null]);
  const nicknameChanged = nickname !== previousNickname;
  let previousDesiredCard: string | null = null;
  if (control.profileFingerprint) {
    try {
      const previousFingerprint: unknown = JSON.parse(control.profileFingerprint);
      if (Array.isArray(previousFingerprint) && typeof previousFingerprint[2] === "string") previousDesiredCard = previousFingerprint[2];
    } catch { /* An absent or invalid baseline must establish one new target version. */ }
  }
  const cardChanged = nicknameChanged || desiredCard !== previousDesiredCard;
  const nicknameRevision = control.nicknameRevision + (nicknameChanged ? 1 : 0);
  const cardRevision = control.cardRevision + (cardChanged ? 1 : 0);
  const automaticObservation = ["profile_refresh", "membership", "reconcile", "qq_event_received", "admin_reconcile"].includes(options.source ?? "");
  const rolloutUsers = process.env.GROUP_CARD_SYNC_USER_IDS?.split(",").map((value) => value.trim()).filter(Boolean);
  const automaticIdentityWrite = groupCardSyncMode() === "active" && (!rolloutUsers?.length || rolloutUsers.includes(userId));
  if (nickname !== null && (!automaticObservation || automaticIdentityWrite)) {
    await tx.authIdentity.updateMany({ where: { userId }, data: { nickname } });
    await tx.botIdentity.updateMany({ where: { OR: [{ userId }, ...(user.qqNumber ? [{ userId: null, qqNumber: user.qqNumber }] : [])] }, data: { qqNickname: nickname } });
  }
  const open = await botOpen(tx);
  const targets = user.workspaceMembers.filter((member) => member.workspace.status !== "DELETED" && member.workspace.qqGroupId !== "default");
  if (options.workspaceId && !targets.some((member) => member.workspaceId === options.workspaceId)) {
    throw new AppError("FORBIDDEN", "你不是该工作空间的在群成员");
  }
  const existing = await tx.groupCardSyncState.findMany({ where: { userId } });
  const activeGroups = new Set(targets.map((member) => member.workspace.qqGroupId));
  for (const state of existing) {
    if (!activeGroups.has(state.groupId)) {
      await tx.groupCardSyncState.update({ where: { id: state.id }, data: { status: "not_applicable", nextAttemptAt: null, lastErrorCode: "LEFT_GROUP", lastError: "已退出该群" } });
      await tx.groupCardSyncInbox.updateMany({
        where: { userId, groupId: state.groupId, status: "pending" },
        data: { status: "processed", outcome: "inactive_group", finishedAt: now, nextAttemptAt: null },
      });
    }
  }
  for (const member of targets) {
    const groupId = member.workspace.qqGroupId;
    const previous = existing.find((state) => state.groupId === groupId);
    const enabled = open && operational(member.workspace, now) && user.status === "ACTIVE";
    const forced = options.force && (!options.workspaceId || member.workspaceId === options.workspaceId);
    const permissionPaused = !!previous && previous.status === "paused" && ["PERMISSION", "permission_denied", "member_missing"].includes(previous.lastErrorCode ?? "") && !forced;
    const needsWork = cardChanged || forced || !previous || previous.status === "not_applicable" || (enabled && previous.status === "paused" && previous.lastErrorCode === "WORKSPACE_PAUSED");
    const valid = isValidGroupCardNickname(nickname ?? "");
    const status = !enabled || permissionPaused ? "paused" : !valid ? "failed" : needsWork ? "pending" : previous?.status ?? "pending";
    const baseline = options.baselineGroupId === groupId ? options.baselineCard : undefined;
    await tx.groupCardSyncState.upsert({
      where: { userId_groupId: { userId, groupId } },
      create: {
        userId, workspaceId: member.workspaceId, qqNumber: user.qqNumber ?? "", groupId, desiredCard,
        desiredNicknameRevision: nicknameRevision, desiredCardRevision: cardRevision, status,
        pendingSince: now,
        nextAttemptAt: enabled && valid ? now : null,
        ...(baseline !== undefined ? { observedCard: baseline, observedAt: now, resolvedObservedCard: baseline, observedSeq: 1, resolvedObservationSeq: 1, resolvedAt: now } : {}),
        lastErrorCode: !enabled ? "WORKSPACE_PAUSED" : !valid ? "NICKNAME_MISSING" : null,
        lastError: !enabled ? "该群同步暂时停用" : !valid ? "请先设置有效昵称" : null,
      },
      update: {
        workspaceId: member.workspaceId, qqNumber: user.qqNumber ?? "", desiredCard,
        desiredNicknameRevision: nicknameRevision, desiredCardRevision: cardRevision, status,
        ...(needsWork ? { pendingSince: cardChanged || previous?.status === "synced" ? now : previous?.pendingSince ?? now } : {}),
        ...((needsWork || !enabled) ? { nextAttemptAt: enabled && valid && !permissionPaused ? now : null } : {}),
        ...(needsWork && !permissionPaused ? { attemptCount: 0, lastError: null, lastErrorCode: null } : {}),
        ...(!enabled ? { lastErrorCode: "WORKSPACE_PAUSED", lastError: "该群同步暂时停用" } : {}),
        ...(!valid && enabled ? { lastErrorCode: "NICKNAME_MISSING", lastError: "请先设置有效昵称", nextAttemptAt: null } : {}),
        ...(previous?.status === "not_applicable" ? { resolvedObservedCard: null, resolvedAt: null } : {}),
        ...(baseline !== undefined ? { observedCard: baseline, observedAt: now, resolvedObservedCard: baseline, resolvedAt: now } : {}),
      },
    });
  }
  await tx.userNicknameSync.update({ where: { userId }, data: {
    nicknameRevision, cardRevision, profileFingerprint: fingerprint,
    ...(nicknameChanged ? { nicknameChangedAt: now, nicknameSource: options.source ?? "website", nicknameSourceGroupId: options.sourceGroupId ?? null } : {}),
    ...(options.initialize ? { initializedAt: control.initializedAt ?? now } : {}),
    ...(targets.length ? { nextWorkAt: now } : { nextWorkAt: null }),
    // New website edits must never clear a worker's live lease.
  } });
  return { nickname, nicknameRevision, cardRevision, desiredCard };
}
export async function queueGroupCardSync(userId: string, options: QueueGroupCardSyncOptions = {}) {
  return db.$transaction((tx) => queueGroupCardSyncInTransaction(tx, userId, options));
}
export async function syncMembershipGroupCardsInTransaction(tx: Tx, userId: string, _options?: { groupId?: string; left?: boolean }) {
  void _options;
  await queueGroupCardSyncInTransaction(tx, userId, { source: "membership" });
}
export async function retryGroupCardSync(userId: string, workspaceId?: string) {
  const now = new Date();
  await db.$transaction(async (tx) => {
    await lockRatingUserTasks(tx, userId);
    const control = await ensureControl(tx, userId);
    if (control.manualRetryAt && now.getTime() - control.manualRetryAt.getTime() < 30_000) {
      throw new AppError("COOLDOWN_ACTIVE", "请等待 30 秒后再重新同步");
    }
    await queueGroupCardSyncInTransaction(tx, userId, { force: true, workspaceId, now });
    await tx.userNicknameSync.update({ where: { userId }, data: { manualRetryAt: now } });
  });
  return getGroupCardSyncSummary(userId);
}
async function readSummary(tx: Tx, userId: string): Promise<GroupCardSyncSummary> {
  const now = new Date();
  const [control, states, open] = await Promise.all([
    tx.userNicknameSync.findUnique({ where: { userId } }),
    tx.groupCardSyncState.findMany({ where: { userId }, include: { workspace: { select: {
      name: true, status: true, expiresAt: true, botEnabled: true,
    } } }, orderBy: { groupId: "asc" } }),
    botOpen(tx),
  ]);
  const groups = states.map((state) => ({
    workspaceId: state.workspaceId, workspaceName: state.workspace.name, groupId: state.groupId,
    desiredCard: state.desiredCard, observedCard: state.observedCard, confirmedCard: state.confirmedCard,
    lastVerifiedAt: state.syncedAt?.toISOString() ?? null,
    status: (state.status === "synced" && (state.confirmedRevision !== state.desiredCardRevision ||
      state.confirmedCard !== state.desiredCard || state.observedCard !== state.desiredCard) ? "pending" : state.status) as GroupCardSyncStatus,
    reason: groupCardSyncReason(state.lastErrorCode, state.lastError),
  }));
  for (let index = 0; index < groups.length; index++) {
    if (groups[index].status !== "not_applicable" && (!open || !operational(states[index].workspace, now))) {
      groups[index].status = "paused";
      groups[index].reason = "该群同步暂时停用或工作空间已到期";
    }
  }
  const rollout = process.env.GROUP_CARD_SYNC_USER_IDS?.split(",").map((value) => value.trim()).filter(Boolean);
  if (groupCardSyncMode() !== "active" || (rollout?.length && !rollout.includes(userId))) {
    for (const group of groups) {
      if (group.status !== "not_applicable" && group.status !== "synced") {
        group.status = "paused";
        group.reason = "自动同步尚未启用；网站修改已保存，启用后会继续同步";
      }
    }
  }
  const dates = groups.filter((group) => group.status !== "not_applicable").map((group) => group.lastVerifiedAt);
  return { status: aggregateGroupCardSyncStatus(groups), nicknameRevision: control?.nicknameRevision ?? 0, cardRevision: control?.cardRevision ?? 0,
    lastVerifiedAt: dates.length && dates.every(Boolean) ? dates.sort()[0] : null, groups };
}
export async function getGroupCardSyncSummary(userId: string): Promise<GroupCardSyncSummary> {
  return db.$transaction((tx) => readSummary(tx, userId), { isolationLevel: "RepeatableRead" });
}
export async function getGroupCardSyncView(userId: string) {
  return db.$transaction(async (tx) => {
    const [groupCardSync, identities] = await Promise.all([
      readSummary(tx, userId),
      tx.authIdentity.findMany({ where: { userId }, select: { provider: true, nickname: true }, orderBy: { createdAt: "asc" } }),
    ]);
    return { nickname: canonicalNickname(identities), nicknameRevision: groupCardSync.nicknameRevision, groupCardSync };
  }, { isolationLevel: "RepeatableRead" });
}

export interface ReceivedGroupCardEvent {
  groupId: string; qqNumber: string; cardNew: string; cardOld: string;
  selfId?: string; timestamp?: number; time?: number; eventId?: string; rawEvent?: unknown;
}
export async function acceptGroupCardEvent(event: ReceivedGroupCardEvent, workspaceId: string) {
  const receivedAt = new Date();
  const time = event.timestamp ?? event.time;
  const occurredAt = typeof time === "number" && Number.isFinite(time) && time > 0 ? new Date(time * 1000) : null;
  const rawPayload = JSON.parse(JSON.stringify(event.rawEvent ?? event)) as Prisma.InputJsonValue;
  const selfId = event.selfId ?? String((rawPayload as Record<string, unknown>).self_id ?? "");
  const eventKey = createHash("sha256").update(JSON.stringify([selfId, event.groupId, event.qqNumber, event.cardOld, event.cardNew, time ?? null])).digest("hex");
  return db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { qqNumber: event.qqNumber }, select: { id: true, status: true } });
    if (user) await lockRatingUserTasks(tx, user.id);
    const member = user && await tx.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: user.id } } });
    const accepted = !!user && user.status === "ACTIVE" && !!member && !member.leftAt;
    const inserted = await tx.groupCardSyncInbox.createMany({ skipDuplicates: true, data: {
      eventKey, userId: user?.id, groupId: event.groupId, qqNumber: event.qqNumber, selfId,
      cardOld: event.cardOld, cardNew: event.cardNew, occurredAt, receivedAt, rawPayload,
      status: accepted ? "pending" : "ignored", outcome: accepted ? null : "unlinked_or_inactive_member",
      nextAttemptAt: accepted ? receivedAt : null, finishedAt: accepted ? null : receivedAt,
    } });
    if (!inserted.count) return { duplicate: true };
    // This audit write must propagate failures; the general audit helper swallows them.
    await tx.botEventLog.create({ data: { eventId: eventKey, platform: "napcat", eventType: "group_card_changed", groupId: event.groupId, qqNumber: event.qqNumber, rawPayload, handled: !accepted } });
    if (accepted && user) {
      await queueGroupCardSyncInTransaction(tx, user.id, { now: receivedAt, source: "qq_event_received", force: true, workspaceId });
    }
    return { duplicate: false };
  });
}

async function snapshot(tx: Tx, userId: string, token: string, now: Date): Promise<SyncUserSnapshot | null> {
  const control = await tx.userNicknameSync.findUnique({ where: { userId } });
  if (!control || control.leaseToken !== token || !control.leaseUntil || control.leaseUntil <= now) return null;
  const user = await loadUser(tx, userId);
  if (!user?.qqNumber || user.status !== "ACTIVE") return null;
  const [states, inbox, pendingAttempts, recentAttempts, open] = await Promise.all([
    tx.groupCardSyncState.findMany({ where: { userId, status: { not: "not_applicable" } }, include: { workspace: true } }),
    tx.groupCardSyncInbox.findMany({ where: { userId, status: "pending", OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] }, orderBy: { receivedAt: "asc" }, take: 200 }),
    tx.groupCardWriteAttempt.findMany({ where: { userId, status: { in: ["prepared", "sent", "unknown"] } }, orderBy: { startedAt: "asc" } }),
    tx.groupCardWriteAttempt.findMany({ where: { userId, status: { notIn: ["prepared", "sent", "unknown"] }, startedAt: { gte: new Date(now.getTime() - 600_000) } }, orderBy: { startedAt: "desc" }, take: 100 }),
    botOpen(tx),
  ]);
  return { userId, qqNumber: user.qqNumber, nickname: canonicalNickname(user.authIdentities) ?? "", sourceWorkspaceId: user.sourceWorkspaceId,
    nicknameRevision: control.nicknameRevision, nicknameChangedAt: control.nicknameChangedAt, cardRevision: control.cardRevision, initializedAt: control.initializedAt,
    groups: states.map((state) => ({ ...state, workspaceName: state.workspace.name, workspaceSlug: state.workspace.slug,
      operational: open && operational(state.workspace, now) && state.workspace.qqGroupId === state.groupId && user.workspaceMembers.some((member) => member.workspaceId === state.workspaceId) && !(["PERMISSION", "permission_denied", "member_missing"].includes(state.lastErrorCode ?? "") && state.status === "paused"), joinedAt: user.workspaceMembers.find((member) => member.workspaceId === state.workspaceId)?.joinedAt ?? state.createdAt,
      status: state.status as GroupCardSyncStatus })), inbox, attempts: [...pendingAttempts, ...recentAttempts] };
}
async function fenced(tx: Tx, userId: string, token: string, cardRevision: number, now: Date) {
  const control = await tx.userNicknameSync.findUnique({ where: { userId } });
  return !!control && control.leaseToken === token && !!control.leaseUntil && control.leaseUntil > now && control.cardRevision === cardRevision;
}
async function nextWork(tx: Tx, userId: string, now: Date) {
  const [state, inbox] = await Promise.all([
    tx.groupCardSyncState.findFirst({ where: { userId, status: { in: ["pending", "failed", "syncing"] }, nextAttemptAt: { not: null } }, orderBy: { nextAttemptAt: "asc" } }),
    tx.groupCardSyncInbox.findFirst({ where: { userId, status: "pending", groupId: { in: (await tx.groupCardSyncState.findMany({ where: { userId, status: { notIn: ["paused", "not_applicable"] } }, select: { groupId: true } })).map((group) => group.groupId) } }, orderBy: { nextAttemptAt: "asc" } }),
  ]);
  const dates = [state?.nextAttemptAt, inbox ? inbox.nextAttemptAt ?? now : null].filter((date): date is Date => !!date);
  return dates.length ? new Date(Math.min(...dates.map((date) => date.getTime()))) : null;
}
export const groupCardSyncRepository: GroupCardSyncRepository = {
  async recordHealth(online, now, error) {
    await db.systemConfig.upsert({ where: { key: "groupCardSyncHealth" },
      create: { key: "groupCardSyncHealth", value: { online, checkedAt: now.toISOString(), error: error ?? null } },
      update: { value: { online, checkedAt: now.toISOString(), error: error ?? null } },
    });
  },
  async listDueUsers(now, limit) {
    const allowlist = process.env.GROUP_CARD_SYNC_USER_IDS?.split(",").map((value) => value.trim()).filter(Boolean);
    const controls = await db.userNicknameSync.findMany({ where: { ...(allowlist?.length ? { userId: { in: allowlist } } : {}), user: { status: "ACTIVE", qqNumber: { not: null } }, nextWorkAt: { lte: now }, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] }, orderBy: { nextWorkAt: "asc" }, take: limit, select: { userId: true } });
    return controls.map((control) => control.userId);
  },
  async claimLease(userId, token, now, until) {
    return db.$transaction(async (tx) => {
      await lockRatingUserTasks(tx, userId);
      const result = await tx.userNicknameSync.updateMany({ where: { userId, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] }, data: { leaseToken: token, leaseUntil: until } });
      return result.count === 1;
    });
  },
  async renewLease(userId, token, now, until) {
    const result = await db.userNicknameSync.updateMany({ where: { userId, leaseToken: token, leaseUntil: { gt: now } }, data: { leaseUntil: until } });
    return result.count === 1;
  },
  async releaseLease(userId, token, now) {
    await db.$transaction(async (tx) => {
      await lockRatingUserTasks(tx, userId);
      if (groupCardSyncMode() === "observe") {
        await tx.userNicknameSync.updateMany({ where: { userId, leaseToken: token }, data: { leaseToken: null, leaseUntil: null, nextWorkAt: new Date(now.getTime() + 600_000) } });
      } else {
        await tx.userNicknameSync.updateMany({ where: { userId, leaseToken: token }, data: { leaseToken: null, leaseUntil: null, nextWorkAt: await nextWork(tx, userId, now) } });
      }
    });
  },
  async loadSnapshot(userId, token, now) { return snapshot(db, userId, token, now); },
  async acceptDecision(userId, token, expectedCardRevision, decision: SyncDecision, now, mode) {
    return db.$transaction(async (tx) => {
      await lockRatingUserTasks(tx, userId);
      if (!(await fenced(tx, userId, token, expectedCardRevision, now))) return null;
      const liveSnapshot = await snapshot(tx, userId, token, now);
      if (!liveSnapshot) return null;
      const operationalGroups = new Set(liveSnapshot.groups.filter((group) => group.operational).map((group) => group.groupId));
      if (mode === "active" && decision.nickname !== undefined &&
        (!decision.sourceGroupId || !operationalGroups.has(decision.sourceGroupId))) return null;
      if (mode === "active") {
        await queueGroupCardSyncInTransaction(tx, userId, { nickname: decision.nickname, source: "qq", sourceGroupId: decision.sourceGroupId, now });
      }
      let consumedObservations = 0;
      for (const observation of decision.observations) {
        if (!operationalGroups.has(observation.groupId)) continue;
        const state = await tx.groupCardSyncState.findUnique({ where: { userId_groupId: { userId, groupId: observation.groupId } } });
        if (!state) continue;
        await tx.groupCardSyncState.update({ where: { id: state.id }, data: {
          observedCard: observation.card, observedAt: observation.observedAt, observedSeq: { increment: 1 },
          ...(mode === "active" ? { resolvedObservedCard: observation.card, resolvedObservationSeq: state.observedSeq + 1, resolvedAt: now } : {}),
        } });
        consumedObservations++;
      }
      if (mode === "active") {
        for (const outcome of decision.inboxOutcomes ?? []) {
          const inbox = liveSnapshot.inbox.find((item) => item.id === outcome.id);
          if (!inbox || !operationalGroups.has(inbox.groupId)) continue;
          await tx.groupCardSyncInbox.updateMany({ where: { id: outcome.id, userId, status: "pending" }, data: { status: "processed", outcome: outcome.outcome, finishedAt: now, nextAttemptAt: null } });
        }
        // A paused or departed batch has no QQ baseline. Preserve first-run
        // QQ priority until at least one live group's observation is consumed.
        if (consumedObservations > 0) {
          const control = await tx.userNicknameSync.findUniqueOrThrow({ where: { userId } });
          await tx.userNicknameSync.update({ where: { userId }, data: { initializedAt: control.initializedAt ?? now } });
        }
      }
      return snapshot(tx, userId, token, now);
    });
  },
  async prepareAttempt(userId, token, groupId, cardRevision, beforeCard, now) {
    return db.$transaction(async (tx) => {
      await lockRatingUserTasks(tx, userId);
      if (!(await fenced(tx, userId, token, cardRevision, now))) return null;
      const state = await tx.groupCardSyncState.findUnique({ where: { userId_groupId: { userId, groupId } } });
      if (!state || state.desiredCardRevision !== cardRevision) return null;
      const currentSnapshot = await snapshot(tx, userId, token, now);
      if (!currentSnapshot || !isValidGroupCardNickname(currentSnapshot.nickname) ||
        !currentSnapshot.groups.some((group) => group.groupId === groupId && group.operational)) return null;
      const attempt = await tx.groupCardWriteAttempt.create({ data: {
        userId, groupId, qqNumber: state.qqNumber, nicknameRevision: state.desiredNicknameRevision,
        cardRevision, targetCard: state.desiredCard, fromObservedCard: beforeCard,
        baselineObservationSeq: state.resolvedObservationSeq, leaseToken: token, startedAt: now,
      } });
      await tx.groupCardSyncState.update({ where: { id: state.id }, data: { status: "syncing", nextAttemptAt: now } });
      return { id: attempt.id };
    });
  },
  async finishAttempt(input: SyncFinishAttempt) {
    return db.$transaction(async (tx) => {
      await lockRatingUserTasks(tx, input.userId);
      const attempt = await tx.groupCardWriteAttempt.findUnique({ where: { id: input.attemptId } });
      if (!attempt || attempt.userId !== input.userId || attempt.leaseToken !== input.token) return false;
      const state = await tx.groupCardSyncState.findUnique({ where: { userId_groupId: { userId: input.userId, groupId: input.groupId } } });
      const versionCurrent = await fenced(tx, input.userId, input.token, input.cardRevision, input.now) && state?.desiredCardRevision === input.cardRevision;
      // A departure, pause, or newly received QQ notice need not change the
      // website target revision. Recheck them under the same user lock before
      // an earlier readback is allowed to confirm the current group state.
      const liveSnapshot = versionCurrent ? await snapshot(tx, input.userId, input.token, input.now) : null;
      const liveGroup = liveSnapshot?.groups.find((group) => group.groupId === input.groupId);
      const pendingNotice = versionCurrent ? await tx.groupCardSyncInbox.findFirst({
        where: { userId: input.userId, groupId: input.groupId, status: "pending" }, select: { id: true },
      }) : null;
      const current = versionCurrent && !!liveGroup?.operational &&
        state?.status !== "paused" && state?.status !== "not_applicable" && !pendingNotice;
      const confirmed = current && input.status === "confirmed" && input.observedCard === state?.desiredCard;
      await tx.groupCardWriteAttempt.update({ where: { id: input.attemptId }, data: {
        status: !current ? "superseded" : confirmed ? "confirmed" : input.status,
        completedAt: input.now, readAfter: input.observedCard, error: input.error, errorCode: input.errorCode,
      } });
      if (!state) return false;
      if (!current) {
        // Stale remote results are evidence, never confirmation of the new version.
        return false;
      }
      await tx.groupCardSyncState.update({ where: { id: state.id }, data: {
        ...(input.observedCard !== undefined ? { observedCard: input.observedCard, observedAt: input.now, observedSeq: { increment: 1 } } : {}),
        ...(confirmed ? { status: "synced", pendingSince: null, confirmedCard: input.observedCard, confirmedRevision: input.cardRevision, syncedAt: input.now,
          resolvedObservedCard: input.observedCard, resolvedObservationSeq: state.observedSeq + 1, resolvedAt: input.now,
          attemptCount: 0, nextAttemptAt: null, lastError: null, lastErrorCode: null } : {
          status: ["PERMISSION", "permission_denied", "member_missing"].includes(input.errorCode ?? "") ? "paused" : "failed", attemptCount: { increment: 1 },
          nextAttemptAt: ["PERMISSION", "permission_denied", "member_missing"].includes(input.errorCode ?? "") ? null : input.nextAttemptAt ?? new Date(input.now.getTime() + 5_000),
          lastError: input.error ?? "QQ 名片尚未读回确认", lastErrorCode: input.errorCode ?? "READBACK_MISMATCH",
        }),
      } });
      if (confirmed) {
        await tx.groupCardWriteAttempt.updateMany({ where: { userId: input.userId, groupId: input.groupId, id: { not: input.attemptId }, cardRevision: { lte: input.cardRevision }, status: { in: ["prepared", "sent", "unknown"] } }, data: { status: "reconciled", completedAt: input.now } });
        await tx.botIdentity.updateMany({ where: { groupId: input.groupId, OR: [{ userId: input.userId }, ...(state.qqNumber ? [{ userId: null, qqNumber: state.qqNumber }] : [])] }, data: { groupCard: input.observedCard, groupCardSyncStatus: "synced", groupCardSyncedAt: input.now } });
      }
      await tx.botActionLog.create({ data: { action: "set_group_card", groupId: input.groupId, qqNumber: state.qqNumber,
        status: confirmed ? "success" : "failed", request: { attemptId: input.attemptId, cardRevision: input.cardRevision, targetCard: attempt.targetCard },
        response: { observedCard: input.observedCard ?? null, confirmed }, errorMessage: input.error } });
      return confirmed;
    });
  },
  async failGroup(userId, token, groupId, cardRevision, errorCode, error, nextAttemptAt, now) {
    await db.$transaction(async (tx) => {
      await lockRatingUserTasks(tx, userId);
      if (!(await fenced(tx, userId, token, cardRevision, now))) return;
      await tx.groupCardSyncState.updateMany({ where: { userId, groupId, desiredCardRevision: cardRevision }, data: {
        status: ["PERMISSION", "permission_denied", "member_missing"].includes(errorCode) ? "paused" : "failed", lastErrorCode: errorCode, lastError: error,
        attemptCount: { increment: 1 }, nextAttemptAt: ["PERMISSION", "permission_denied", "member_missing"].includes(errorCode) ? null : nextAttemptAt,
      } });
      await tx.groupCardSyncInbox.updateMany({ where: { userId, groupId, status: "pending" }, data: { nextAttemptAt, attemptCount: { increment: 1 }, error } });
    });
  },
  async listReconcileGroups() {
    if (!(await botOpen(db))) return [];
    const now = new Date();
    const workspaces = await db.workspace.findMany({ where: { status: "ACTIVE", botEnabled: true, qqGroupId: { not: "default" }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, select: { id: true, qqGroupId: true } });
    return workspaces.map((workspace) => ({ workspaceId: workspace.id, groupId: workspace.qqGroupId }));
  },
  async scheduleReconciliation(workspaceId, members, now) {
    const membership = await db.workspaceMember.findMany({ where: { workspaceId, leftAt: null, user: { status: "ACTIVE", qqNumber: { not: null } } }, select: { userId: true, user: { select: { qqNumber: true } } } });
    const byQQ = new Map(members.map((member) => [member.qqNumber, member.card]));
    for (const member of membership) {
      if (!member.user.qqNumber || !byQQ.has(member.user.qqNumber)) continue; // Not a membership revocation job.
      await db.$transaction(async (tx) => {
        await queueGroupCardSyncInTransaction(tx, member.userId, { now, source: "reconcile" });
        const state = await tx.groupCardSyncState.findFirst({ where: { userId: member.userId, workspaceId } });
        if (!state) return;
        const card = byQQ.get(member.user.qqNumber!)!;
        await tx.groupCardSyncState.update({ where: { id: state.id }, data: { observedCard: card, observedAt: now, observedSeq: { increment: 1 } } });
        // Only differences, uninitialized baselines, and unresolved inputs need per-user reads.
        if (state.status !== "paused" && (card !== state.desiredCard || state.status !== "synced" || !state.resolvedObservedCard)) {
          await tx.userNicknameSync.update({ where: { userId: member.userId }, data: { nextWorkAt: now } });
        } else {
          await tx.userNicknameSync.update({ where: { userId: member.userId }, data: { nextWorkAt: await nextWork(tx, member.userId, now) } });
        }
      });
    }
    await db.workspaceLog.create({ data: { workspaceId, action: "GROUP_CARDS_RECONCILED", metadata: { memberCount: members.length, checkedAccountCount: membership.length, at: now.toISOString() } } });
  },
  async refreshProfileTargets(now) {
    const users = await db.user.findMany({ where: { status: "ACTIVE", qqNumber: { not: null }, workspaceMembers: { some: { leftAt: null } } }, select: { id: true }, orderBy: { id: "asc" } });
    for (const user of users) await queueGroupCardSync(user.id, { now, source: "profile_refresh" });
  },
  async resumePending(now) {
    const ids = await db.userNicknameSync.findMany({ where: { user: { status: "ACTIVE", qqNumber: { not: null } } }, select: { userId: true } });
    for (const { userId } of ids) {
      await db.$transaction(async (tx) => {
        await queueGroupCardSyncInTransaction(tx, userId, { now, source: "reconcile" });
        await tx.groupCardSyncState.updateMany({ where: { userId, status: { in: ["pending", "failed", "syncing"] } }, data: { nextAttemptAt: now } });
        await tx.userNicknameSync.update({ where: { userId }, data: { nextWorkAt: now } });
      });
    }
  },
  async cleanup(now) {
    const cutoff = new Date(now.getTime() - 30 * 86_400_000);
    await db.groupCardSyncInbox.deleteMany({ where: { status: { in: ["processed", "ignored"] }, finishedAt: { lt: cutoff } } });
    await db.groupCardWriteAttempt.deleteMany({ where: { status: { in: ["confirmed", "failed", "superseded", "reconciled"] }, completedAt: { lt: cutoff } } });
  },
};
