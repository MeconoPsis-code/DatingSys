import { randomUUID } from "node:crypto";
import { isValidGroupCardNickname, normalizeNicknameInput } from "@/lib/group-card";
import { groupCardRetryDelay } from "@/lib/group-card-sync";
import type {
  GroupCardCoordinatorDependencies,
  SyncDecision,
  SyncGroupSnapshot,
  SyncInboxSnapshot,
  SyncObservation,
  SyncUserSnapshot,
} from "./group-card-sync.types";

export const GROUP_CARD_LEASE_MS = 120_000;
export const GROUP_CARD_RECONCILE_MS = 10 * 60_000;
const LEASE_HEARTBEAT_MS = 15_000;
const HEALTH_CHECK_MS = 30_000;
const READBACK_DELAYS_MS = [0, 2_000, 5_000];

class LeaseLostError extends Error {
  constructor() { super("Group card synchronization lease was lost"); }
}

function nicknameCandidate(card: string): { nickname: string | null; reason: string } {
  if (!card.trim()) return { nickname: null, reason: "empty_card" };
  const nickname = normalizeNicknameInput(card);
  if (nickname === card.trim() && /^\s*\d{1,4}\s*([^\sA-Za-z0-9\u4e00-\u9fff])\s*[\u4e00-\u9fff]{2,12}\s*\1\s*\S[\s\S]*$/u.test(card)) {
    return { nickname: null, reason: "ambiguous_card" };
  }
  if (!nickname) return { nickname: null, reason: "empty_card" };
  if (!isValidGroupCardNickname(nickname)) return { nickname: null, reason: "invalid_nickname" };
  return { nickname, reason: "qq_change" };
}

function priority(group: SyncGroupSnapshot, snapshot: SyncUserSnapshot): number {
  if (group.workspaceId === snapshot.sourceWorkspaceId) return 0;
  return group.workspaceSlug === "official" ? 1 : 2;
}

function currentEvent(events: SyncInboxSnapshot[], card: string): SyncInboxSnapshot | undefined {
  return events.filter((event) => event.cardNew === card).sort((left, right) =>
    (right.occurredAt?.getTime() ?? 0) - (left.occurredAt?.getTime() ?? 0) ||
    right.receivedAt.getTime() - left.receivedAt.getTime() || left.id.localeCompare(right.id)
  )[0];
}

/** Resolve one complete batch, before propagating its winner to any group. */
export function decideGroupCardNickname(
  snapshot: SyncUserSnapshot,
  observations: SyncObservation[],
): SyncDecision {
  const candidates: Array<{ group: SyncGroupSnapshot; nickname: string; event?: SyncInboxSnapshot }> = [];
  const outcomes: Array<{ id: string; outcome: string }> = [];
  const resolved: SyncObservation[] = [];
  for (const observation of observations) {
    const group = snapshot.groups.find((item) => item.groupId === observation.groupId);
    if (!group?.operational) continue;
    const events = snapshot.inbox.filter((item) => item.groupId === group.groupId);
    const event = currentEvent(events, observation.card);
    const parsed = nicknameCandidate(observation.card);
    let outcome = parsed.reason;
    // Source clocks only corroborate order. A newly received event whose
    // current QQ value is verified must not be discarded on source time alone.
    const staleEvent = event?.occurredAt && snapshot.nicknameChangedAt &&
      event.receivedAt.getTime() <= snapshot.nicknameChangedAt.getTime() &&
      event.occurredAt.getTime() < Math.floor(snapshot.nicknameChangedAt.getTime() / 1_000) * 1_000;
    const freshEvent = !!event && !staleEvent;
    const witnessedIntermediate = freshEvent && event.cardOld !== observation.card &&
      event.cardOld === group.observedCard && group.observedCard !== group.resolvedObservedCard &&
      (group.observedSeq ?? 0) > group.resolvedObservationSeq &&
      !!group.observedAt && !!group.resolvedAt && group.observedAt >= group.resolvedAt &&
      event.receivedAt >= group.observedAt;
    const ownWrite = snapshot.attempts.some((attempt) => {
      if (attempt.groupId !== group.groupId || attempt.targetCard !== observation.card ||
        attempt.fromObservedCard === attempt.targetCard || ["failed", "reconciled"].includes(attempt.status)) return false;
      if (event?.occurredAt) {
        return event.cardOld === attempt.fromObservedCard &&
          event.occurredAt.getTime() >= Math.floor(attempt.startedAt.getTime() / 1_000) * 1_000 &&
          event.occurredAt.getTime() <= Math.ceil(Math.min(attempt.completedAt?.getTime() ?? Infinity,
            attempt.startedAt.getTime() + GROUP_CARD_LEASE_MS) / 1_000) * 1_000;
      }
      if (["prepared", "sent", "unknown"].includes(attempt.status) && attempt.cardRevision < snapshot.cardRevision) return true;
      return ["prepared", "sent", "unknown", "superseded"].includes(attempt.status) &&
        observation.observedAt.getTime() - (attempt.completedAt ?? attempt.startedAt).getTime() <= GROUP_CARD_LEASE_MS;
    });
    // A later delivery of the original X -> B notice is not a new B change:
    // B was already consumed by the batch, even if its propagation failed.
    // Only a recorded intervening value plus the event's old value can prove
    // that this same B is a new transition rather than the unresolved loser.
    const knownLoser = !witnessedIntermediate && group.resolvedObservedCard === observation.card && group.resolvedObservationSeq > 0;
    const knownOldBaseline = !freshEvent && group.confirmedCard === observation.card &&
      group.confirmedRevision !== null && group.confirmedRevision < snapshot.cardRevision;
    const joinedExistingUser = snapshot.initializedAt !== null && group.resolvedObservedCard === null && !freshEvent;
    if (parsed.nickname === snapshot.nickname) outcome = "already_current";
    else if (ownWrite) outcome = "self_write";
    else if (knownLoser || knownOldBaseline) outcome = "resolved_baseline";
    else if (staleEvent) outcome = "stale_event";
    else if (joinedExistingUser) outcome = "new_group_baseline";
    else if (parsed.nickname) candidates.push({ group, nickname: parsed.nickname, event });
    for (const item of events) outcomes.push({ id: item.id, outcome: item.cardNew === observation.card ? outcome : "stale_snapshot" });
    resolved.push({ ...observation, inboxIds: events.map((item) => item.id), outcome });
  }
  for (const event of snapshot.inbox) {
    if (!snapshot.groups.some((group) => group.groupId === event.groupId && group.operational)) {
      outcomes.push({ id: event.id, outcome: "inactive_group" });
    }
  }
  // Different QQ groups do not share a reliable change clock. Notification
  // timestamps/arrival cannot establish causality between their current values.
  // Resolve those conflicts with the explicit source / official / join policy.
  candidates.sort((left, right) => {
    return priority(left.group, snapshot) - priority(right.group, snapshot) ||
      left.group.joinedAt.getTime() - right.group.joinedAt.getTime() ||
      left.group.workspaceId.localeCompare(right.group.workspaceId);
  });
  const winner = candidates[0];
  if (winner) {
    for (const item of outcomes) {
      if (item.outcome === "qq_change") {
        item.outcome = snapshot.inbox.find((event) => event.id === item.id)?.groupId === winner.group.groupId
          ? "accepted_qq" : "conflict_resolved";
      }
    }
  }
  return {
    ...(winner ? { nickname: winner.nickname, sourceGroupId: winner.group.groupId, source: "qq" } : {}),
    observations: resolved,
    inboxOutcomes: outcomes,
  };
}

function errorDetails(cause: unknown): { code: string; message: string } {
  const message = cause instanceof Error ? cause.message : String(cause);
  if (/permission|权限|管理员|not.*admin|forbidden|403/i.test(message)) return { code: "permission_denied", message };
  if (/not.*member|not.*group|不在群|群成员不存在|成员不存在/i.test(message)) return { code: "member_missing", message };
  if (/timeout|timed out|abort/i.test(message)) return { code: "timeout", message };
  return { code: "bot_unavailable", message };
}

export function createGroupCardSyncCoordinator(deps: GroupCardCoordinatorDependencies) {
  const now = deps.now ?? (() => new Date());
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const random = deps.random ?? Math.random;
  let ticking = false;
  let wasOnline = false;
  let nextReconcileAt = 0;
  let refreshedDay = "";
  let nextHealthCheckAt = 0;
  let activeCalls = 0;
  const starts: number[] = [];
  const waiters = new Set<() => void>();

  async function botCall<T>(call: () => Promise<T>): Promise<T> {
    // A shared gate applies to health, bulk reads, member reads and writes.
    // At most two calls run, and at most two start in any one-second window.
    while (true) {
      if (activeCalls >= 2) {
        await new Promise<void>((resolve) => { waiters.add(resolve); });
        continue;
      }
      const at = now().getTime();
      while (starts.length && at - starts[0] >= 1_000) starts.shift();
      if (starts.length >= 2) {
        await sleep(Math.max(1, 1_000 - (at - starts[0])));
        continue;
      }
      activeCalls++;
      starts.push(at);
      try { return await call(); }
      finally {
        activeCalls--;
        for (const resolve of waiters) resolve();
        waiters.clear();
      }
    }
  }

  async function processUser(userId: string): Promise<void> {
    const mode = deps.mode();
    if (mode === "off") return;
    const token = randomUUID();
    if (!(await deps.repository.claimLease(userId, token, now(), new Date(now().getTime() + GROUP_CARD_LEASE_MS)))) return;
    let lostLease = false;
    let renewal: Promise<void> | null = null;
    async function checkLease() {
      if (lostLease) throw new LeaseLostError();
      const renewed = await deps.repository.renewLease(userId, token, now(), new Date(now().getTime() + GROUP_CARD_LEASE_MS));
      if (!renewed) { lostLease = true; throw new LeaseLostError(); }
    }
    const timer = setInterval(() => {
      if (renewal || lostLease) return;
      renewal = checkLease().catch(() => { lostLease = true; }).finally(() => { renewal = null; });
    }, LEASE_HEARTBEAT_MS);
    timer.unref();
    try {
      let snapshot = await deps.repository.loadSnapshot(userId, token, now());
      if (!snapshot) return;
      const observations: SyncObservation[] = [];
      for (const group of snapshot.groups.filter((item) => item.operational)) {
        await checkLease();
        try {
          const member = await botCall(() => deps.client.getGroupMemberInfo(group.groupId, snapshot!.qqNumber, { noCache: true, retry: false }));
          observations.push({ groupId: group.groupId, card: member.card, observedAt: now() });
        } catch (cause) {
          const { code, message } = errorDetails(cause);
          await deps.repository.failGroup(userId, token, group.groupId, snapshot.cardRevision, code, message,
            new Date(now().getTime() + groupCardRetryDelay(group.attemptCount + 1, random)), now());
        }
      }
      // Failed groups keep their inbox and retry state. Fresh successful reads
      // can still accept a QQ change and propagate it to the healthy groups.
      if (!observations.length && snapshot.groups.some((group) => group.operational)) return;
      const decision = decideGroupCardNickname(snapshot, observations);
      snapshot = await deps.repository.acceptDecision(userId, token, snapshot.cardRevision, decision, now(), mode);
      if (!snapshot || mode !== "active" || deps.mode() !== "active" || !isValidGroupCardNickname(snapshot.nickname.trim())) return;
      for (const observation of observations) {
        const group = snapshot.groups.find((item) => item.groupId === observation.groupId);
        if (!group?.operational || group.status === "not_applicable") continue;
        if (group.status === "paused" && ["permission_denied", "PERMISSION", "member_missing"].includes(group.lastErrorCode ?? "")) continue;
        if (group.nextAttemptAt && group.nextAttemptAt > now() && observation.card !== group.desiredCard) continue;
        await checkLease();
        if (deps.mode() !== "active") break;
        let beforeCard: string;
        try {
          beforeCard = (await botCall(() => deps.client.getGroupMemberInfo(group.groupId, snapshot!.qqNumber, { noCache: true, retry: false }))).card;
        } catch (cause) {
          const { code, message } = errorDetails(cause);
          await deps.repository.failGroup(userId, token, group.groupId, snapshot.cardRevision, code, message,
            new Date(now().getTime() + groupCardRetryDelay(group.attemptCount + 1, random)), now());
          continue;
        }
        if (beforeCard !== observation.card) {
          // QQ changed after the multi-group decision. Re-read a new batch on
          // the next pass instead of overwriting a newly submitted nickname.
          await deps.repository.failGroup(userId, token, group.groupId, snapshot.cardRevision,
            "observation_changed", "QQ 名片在写入前发生变化，正在重新核实", now(), now());
          break;
        }
        // prepareAttempt is fenced against both the global and per-group target
        // revision, and persists the write's identity before any network call.
        const attempt = await deps.repository.prepareAttempt(userId, token, group.groupId, snapshot.cardRevision, beforeCard, now());
        if (!attempt) break;
        if (observation.card === group.desiredCard) {
          await deps.repository.finishAttempt({ userId, token, groupId: group.groupId, cardRevision: snapshot.cardRevision,
            attemptId: attempt.id, status: "confirmed", observedCard: observation.card, now: now() });
          continue;
        }
        let writeError: unknown;
        try {
          if (deps.mode() !== "active") break;
          await botCall(async () => {
            await checkLease();
            const current = await deps.repository.loadSnapshot(userId, token, now());
            if (!current || current.cardRevision !== snapshot!.cardRevision ||
              !current.groups.some((item) => item.groupId === group.groupId && item.operational) || deps.mode() !== "active") {
              throw new Error("Group card target changed before the remote write");
            }
            await deps.client.setGroupCard(group.groupId, snapshot!.qqNumber, group.desiredCard, { retry: false });
          });
        } catch (cause) { writeError = cause; }
        let actualCard: string | undefined;
        let readbackError: unknown;
        for (const delay of READBACK_DELAYS_MS) {
          if (delay) await sleep(delay);
          await checkLease();
          try {
            actualCard = (await botCall(() => deps.client.getGroupMemberInfo(group.groupId, snapshot!.qqNumber, { noCache: true, retry: false }))).card;
            if (actualCard === group.desiredCard) break;
          } catch (cause) { readbackError = cause; }
        }
        if (actualCard === group.desiredCard) {
          const committed = await deps.repository.finishAttempt({ userId, token, groupId: group.groupId,
            cardRevision: snapshot.cardRevision, attemptId: attempt.id, status: "confirmed", observedCard: actualCard, now: now() });
          if (!committed) break;
        } else {
          const error = errorDetails(writeError ?? readbackError ?? new Error("QQ group card did not match the requested value after readback"));
          await deps.repository.finishAttempt({ userId, token, groupId: group.groupId, cardRevision: snapshot.cardRevision,
            attemptId: attempt.id, status: writeError || actualCard === undefined ? "unknown" : "failed",
            ...(actualCard === undefined ? {} : { observedCard: actualCard }), now: now(),
            errorCode: error.code === "bot_unavailable" && !writeError && !readbackError ? "readback_mismatch" : error.code,
            error: error.message, nextAttemptAt: new Date(now().getTime() + groupCardRetryDelay(group.attemptCount + 1, random)) });
        }
      }
    } catch (cause) {
      deps.log?.warn({ userId, err: cause }, "Group card user pass interrupted; persisted work remains pending");
    } finally {
      clearInterval(timer);
      if (renewal) await renewal;
      await deps.repository.releaseLease(userId, token, now());
    }
  }

  async function reconcile(): Promise<void> {
    let failed = false;
    for (const group of await deps.repository.listReconcileGroups()) {
      if (deps.mode() === "off") return;
      try {
        const members = await botCall(() => deps.client.getGroupMemberList(group.groupId, { noCache: true, retry: false }));
        if (!members.length) throw new Error("NapCat returned an empty member list; reconciliation was skipped");
        await deps.repository.scheduleReconciliation(group.workspaceId,
          members.map((member) => ({ qqNumber: member.qqNumber, card: member.card })), now());
      } catch (cause) {
        failed = true;
        deps.log?.warn({ groupId: group.groupId, err: cause }, "Group card reconciliation failed");
      }
    }
    nextReconcileAt = now().getTime() + (failed ? 60_000 : GROUP_CARD_RECONCILE_MS);
  }

  async function tick(): Promise<void> {
    if (ticking || deps.mode() === "off") return;
    ticking = true;
    try {
      const shanghai = new Date(now().getTime() + 8 * 60 * 60_000);
      const day = shanghai.toISOString().slice(0, 10);
      const dailyDue = shanghai.getUTCHours() > 0 || shanghai.getUTCMinutes() >= 5;
      if (!refreshedDay || (day !== refreshedDay && dailyDue)) {
        await deps.repository.refreshProfileTargets(now());
        await deps.repository.cleanup(now());
        refreshedDay = day;
      }
      if (now().getTime() >= nextHealthCheckAt) {
        nextHealthCheckAt = now().getTime() + HEALTH_CHECK_MS;
        try {
          const status = await botCall(() => deps.client.getStatus({ retry: false }));
          await deps.repository.recordHealth?.(status.online && status.good, now());
          if (!status.online || !status.good) {
            if (wasOnline) deps.log?.info({}, "QQ went offline; synchronization remains pending");
            wasOnline = false;
          } else if (!wasOnline) {
            await deps.repository.resumePending(now());
            nextReconcileAt = 0;
            wasOnline = true;
          }
        } catch (cause) {
          wasOnline = false;
          await deps.repository.recordHealth?.(false, now(), cause instanceof Error ? cause.message : String(cause));
          deps.log?.warn({ err: cause }, "QQ health unavailable; synchronization remains pending");
        }
      }
      if (!wasOnline) return;
      if (now().getTime() >= nextReconcileAt) await reconcile();
      const users = await deps.repository.listDueUsers(now(), 20);
      // One durable lease serializes all groups of a user; four distinct users
      // may progress concurrently without blocking the next user's QQ changes.
      let cursor = 0;
      await Promise.all(Array.from({ length: Math.min(4, users.length) }, async () => {
        while (cursor < users.length) {
          const userId = users[cursor++];
          try { await processUser(userId); }
          catch (cause) { deps.log?.error({ userId, err: cause }, "Group card user processing failed"); }
        }
      }));
    } catch (cause) {
      deps.log?.error({ err: cause }, "Group card coordinator tick failed");
    } finally { ticking = false; }
  }

  return { tick, processUser, reconcile };
}
