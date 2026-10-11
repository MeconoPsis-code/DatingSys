import test from "node:test";
import assert from "node:assert/strict";
import { createGroupCardSyncCoordinator, decideGroupCardNickname } from "../src/server/bot/group-card-sync.coordinator";
import type { GroupCardCoordinatorDependencies, GroupCardSyncRepository, SyncDecision, SyncFinishAttempt, SyncGroupSnapshot, SyncUserSnapshot } from "../src/server/bot/group-card-sync.types";
import type { GroupCardSyncMode } from "../src/lib/group-card-sync";

const initialTime = new Date("2026-10-11T04:00:00Z");

function group(groupId: string, options: Partial<SyncGroupSnapshot> = {}): SyncGroupSnapshot {
  return {
    id: `state-${groupId}`, groupId, workspaceId: `workspace-${groupId}`,
    workspaceName: groupId, workspaceSlug: groupId === "official" ? "official" : groupId,
    joinedAt: new Date("2026-10-01T00:00:00Z"), operational: true,
    desiredCard: "25-云南-旧名", desiredCardRevision: 1, status: "pending",
    observedCard: null, observedSeq: 0, observedAt: null, resolvedObservedCard: null, resolvedObservationSeq: 0, resolvedAt: null,
    confirmedCard: null, confirmedRevision: null, syncedAt: null,
    attemptCount: 0, nextAttemptAt: null, lastErrorCode: null, ...options,
  };
}

function user(groups = [group("official")]): SyncUserSnapshot {
  return {
    userId: "user-1", qqNumber: "123456789", nickname: "旧名", sourceWorkspaceId: null,
    nicknameRevision: 1, nicknameChangedAt: new Date("2026-10-10T00:00:00Z"),
    cardRevision: 1, initializedAt: null, groups, inbox: [], attempts: [],
  };
}

function fixture(snapshot = user(), mode: GroupCardSyncMode = "active") {
  let time = new Date(initialTime);
  let currentMode = mode;
  let leaseToken: string | null = null;
  let leaseValid = true;
  let online = true;
  let ignoreWrite = false;
  let writeFailure: Error | null = null;
  let applyBeforeFailure = false;
  let duringWrite: (() => void) | null = null;
  let memberListEmpty = false;
  let duringRead: ((groupId: string, count: number) => void) | null = null;
  const actual = new Map(snapshot.groups.map((item) => [item.groupId, item.desiredCard]));
  const readFailures = new Map<string, Error>();
  const calls = { status: 0, health: [] as Array<{ online: boolean; at: Date; error?: string }>, reads: [] as string[], writes: [] as string[], refreshed: 0, resumed: 0, cleaned: 0, reconciled: [] as string[], claims: 0 };
  const decisions: SyncDecision[] = [];
  const finishes: SyncFinishAttempt[] = [];
  const failures: Array<{ groupId: string; code: string }> = [];
  const member = (groupId: string) => ({ groupId, qqNumber: snapshot.qqNumber, nickname: "QQ昵称", card: actual.get(groupId) ?? "", avatarUrl: "", role: "member" as const, joinTime: 0, lastSentTime: 0 });
  const repository: GroupCardSyncRepository = {
    async recordHealth(online, at, error) { calls.health.push({ online, at, error }); },
    async listDueUsers() { return [snapshot.userId]; },
    async claimLease(_userId, token) {
      calls.claims++;
      if (leaseToken) return false;
      leaseToken = token;
      return true;
    },
    async renewLease(_userId, token) { return leaseValid && leaseToken === token; },
    async releaseLease(_userId, token) { if (leaseToken === token) leaseToken = null; },
    async loadSnapshot(_userId, token) { return token === leaseToken ? structuredClone(snapshot) : null; },
    async acceptDecision(_userId, token, revision, decision, _now, selectedMode) {
      if (token !== leaseToken || revision !== snapshot.cardRevision) return null;
      decisions.push(structuredClone(decision));
      if (selectedMode === "active" && decision.nickname && decision.nickname !== snapshot.nickname) {
        snapshot.nickname = decision.nickname;
        snapshot.nicknameRevision++;
        snapshot.cardRevision++;
        snapshot.nicknameChangedAt = new Date(time);
        for (const item of snapshot.groups) {
          item.desiredCard = `25-云南-${snapshot.nickname}`;
          item.desiredCardRevision = snapshot.cardRevision;
          item.status = "pending";
          item.nextAttemptAt = null;
        }
      }
      for (const observation of decision.observations) {
        const item = snapshot.groups.find((value) => value.groupId === observation.groupId)!;
        item.observedCard = observation.card;
        if (selectedMode === "active") {
          item.resolvedObservedCard = observation.card;
          item.resolvedObservationSeq = snapshot.nicknameRevision;
        }
      }
      if (selectedMode === "active") snapshot.inbox = snapshot.inbox.filter((item) => !decision.inboxOutcomes?.some((outcome) => item.id === outcome.id));
      return structuredClone(snapshot);
    },
    async prepareAttempt(_userId, token, groupId, revision, beforeCard, at) {
      if (token !== leaseToken || snapshot.cardRevision !== revision) return null;
      const item = snapshot.groups.find((value) => value.groupId === groupId)!;
      if (item.desiredCardRevision !== revision) return null;
      const attempt = { id: `attempt-${snapshot.attempts.length}`, groupId, cardRevision: revision,
        targetCard: item.desiredCard, fromObservedCard: beforeCard, status: "prepared", startedAt: at, completedAt: null };
      snapshot.attempts.push(attempt);
      return { id: attempt.id };
    },
    async finishAttempt(input) {
      finishes.push(input);
      const attempt = snapshot.attempts.find((item) => item.id === input.attemptId)!;
      const item = snapshot.groups.find((value) => value.groupId === input.groupId)!;
      if (input.token !== leaseToken || input.cardRevision !== snapshot.cardRevision) {
        attempt.status = "superseded";
        return false;
      }
      attempt.status = input.status;
      attempt.completedAt = input.now;
      if (input.status === "confirmed") {
        item.confirmedCard = input.observedCard ?? null;
        item.confirmedRevision = input.cardRevision;
        item.status = "synced";
      } else {
        item.status = "failed";
        item.nextAttemptAt = input.nextAttemptAt ?? null;
      }
      return true;
    },
    async failGroup(_userId, _token, groupId, _revision, code, _error, nextAttemptAt) {
      failures.push({ groupId, code });
      const item = snapshot.groups.find((value) => value.groupId === groupId)!;
      item.status = code === "permission_denied" ? "paused" : "failed";
      item.nextAttemptAt = nextAttemptAt;
    },
    async listReconcileGroups() { return snapshot.groups.map((item) => ({ workspaceId: item.workspaceId, groupId: item.groupId })); },
    async scheduleReconciliation(workspaceId) { calls.reconciled.push(workspaceId); },
    async refreshProfileTargets() { calls.refreshed++; },
    async resumePending() { calls.resumed++; },
    async cleanup() { calls.cleaned++; },
  };
  const client: GroupCardCoordinatorDependencies["client"] = {
    async getStatus() { calls.status++; return { online, good: online }; },
    async getGroupMemberInfo(groupId, _qq, options) {
      assert.equal(options?.noCache, true);
      calls.reads.push(groupId);
      duringRead?.(groupId, calls.reads.filter((item) => item === groupId).length);
      if (readFailures.has(groupId)) throw readFailures.get(groupId)!;
      return member(groupId);
    },
    async getGroupMemberList(groupId) { return memberListEmpty ? [] : [member(groupId)]; },
    async setGroupCard(groupId, _qq, card) {
      calls.writes.push(groupId);
      duringWrite?.();
      if (!ignoreWrite && (!writeFailure || applyBeforeFailure)) actual.set(groupId, card);
      if (writeFailure) throw writeFailure;
    },
  };
  const coordinator = createGroupCardSyncCoordinator({ repository, client, mode: () => currentMode, now: () => new Date(time),
    sleep: async (ms) => { time = new Date(time.getTime() + ms); }, random: () => 0.5 });
  return { snapshot, actual, calls, decisions, finishes, failures, readFailures, coordinator, client,
    getTime: () => new Date(time),
    setTime: (value: Date) => { time = value; }, setOnline: (value: boolean) => { online = value; },
    setMode: (value: GroupCardSyncMode) => { currentMode = value; }, setLeaseValid: (value: boolean) => { leaseValid = value; },
    setIgnoreWrite: (value: boolean) => { ignoreWrite = value; }, setWriteFailure: (error: Error, applied = false) => { writeFailure = error; applyBeforeFailure = applied; },
    setDuringWrite: (callback: () => void) => { duringWrite = callback; }, setMemberListEmpty: () => { memberListEmpty = true; },
    setDuringRead: (callback: (groupId: string, count: number) => void) => { duringRead = callback; },
  };
}

test("unknown conflicts choose source group once, then failed propagation cannot ping-pong", async () => {
  const snapshot = user([group("official"), group("source")]);
  snapshot.sourceWorkspaceId = "workspace-source";
  const state = fixture(snapshot);
  state.actual.set("official", "25-云南-旧QQ名");
  state.actual.set("source", "25-云南-新QQ名");
  state.setIgnoreWrite(true);
  await state.coordinator.processUser(snapshot.userId);
  assert.equal(snapshot.nickname, "新QQ名");
  assert.equal(snapshot.groups[0].resolvedObservedCard, "25-云南-旧QQ名");
  await state.coordinator.processUser(snapshot.userId);
  assert.equal(snapshot.nickname, "新QQ名");
  assert.equal(state.decisions[1].nickname, undefined);
  state.setIgnoreWrite(false);
  state.setTime(new Date(initialTime.getTime() + 60_000));
  await state.coordinator.processUser(snapshot.userId);
  assert.equal(state.actual.get("official"), "25-云南-新QQ名");
  assert.equal(snapshot.groups[0].status, "synced");
});

test("unknown conflicts fall back to official then oldest joined workspace", () => {
  const snapshot = user([group("b", { joinedAt: new Date(0) }), group("official")]);
  let decision = decideGroupCardNickname(snapshot, snapshot.groups.map((item) => ({ groupId: item.groupId, card: `25-云南-${item.groupId}`, observedAt: initialTime })));
  assert.equal(decision.sourceGroupId, "official");
  snapshot.groups[1].workspaceSlug = "partner";
  decision = decideGroupCardNickname(snapshot, snapshot.groups.map((item) => ({ groupId: item.groupId, card: `25-云南-${item.groupId}`, observedAt: initialTime })));
  assert.equal(decision.sourceGroupId, "b");
});

test("untimed source-group QQ value beats an unrelated group's fresh notice", () => {
  const snapshot = user([group("source"), group("official")]);
  snapshot.sourceWorkspaceId = "workspace-source";
  snapshot.inbox = [{ id: "official-notice", groupId: "official", cardNew: "25-云南-官方当前", cardOld: "", occurredAt: initialTime, receivedAt: initialTime }];
  const result = decideGroupCardNickname(snapshot, [
    { groupId: "source", card: "25-云南-来源当前", observedAt: initialTime },
    { groupId: "official", card: "25-云南-官方当前", observedAt: initialTime },
  ]);
  assert.equal(result.nickname, "来源当前");
});

test("uncorrelated group source timestamps cannot establish a cross-group winner", () => {
  const snapshot = user([group("source"), group("official")]);
  snapshot.sourceWorkspaceId = "workspace-source";
  snapshot.nicknameChangedAt = null;
  snapshot.inbox = [
    { id: "source-notice", groupId: "source", cardNew: "25-云南-来源当前", cardOld: "", occurredAt: new Date("2026-10-01T00:00:00Z"), receivedAt: initialTime },
    { id: "official-notice", groupId: "official", cardNew: "25-云南-官方当前", cardOld: "", occurredAt: new Date("2026-10-12T00:00:00Z"), receivedAt: initialTime },
  ];
  const result = decideGroupCardNickname(snapshot, [
    { groupId: "source", card: "25-云南-来源当前", observedAt: initialTime },
    { groupId: "official", card: "25-云南-官方当前", observedAt: initialTime },
  ]);
  assert.equal(result.nickname, "来源当前");
});

test("new group imports an existing nickname instead of renaming an initialized user", () => {
  const snapshot = user([group("official", { resolvedObservedCard: "25-云南-旧名", resolvedObservationSeq: 1 }), group("new-group")]);
  snapshot.initializedAt = initialTime;
  const result = decideGroupCardNickname(snapshot, [
    { groupId: "official", card: "25-云南-旧名", observedAt: initialTime },
    { groupId: "new-group", card: "25-云南-加入群时的旧QQ名", observedAt: initialTime },
  ]);
  assert.equal(result.nickname, undefined);
  assert.equal(result.observations[1].outcome, "new_group_baseline");
});

test("explicit fresh QQ edit in a new group remains bidirectional", () => {
  const snapshot = user([group("new-group")]);
  snapshot.initializedAt = initialTime;
  snapshot.inbox = [{ id: "new-edit", groupId: "new-group", cardNew: "25-云南-主动新名", cardOld: "", occurredAt: initialTime, receivedAt: initialTime }];
  const result = decideGroupCardNickname(snapshot, [{ groupId: "new-group", card: "25-云南-主动新名", observedAt: initialTime }]);
  assert.equal(result.nickname, "主动新名");
});

test("fresh late manual rename to a historical nickname remains valid", () => {
  const snapshot = user([group("official", { resolvedObservedCard: "25-云南-旧名", resolvedObservationSeq: 1 })]);
  snapshot.attempts = [{ id: "old-write", groupId: "official", cardRevision: 1, targetCard: "25-云南-原名",
    fromObservedCard: "25-云南-更早名", status: "confirmed", startedAt: new Date("2026-10-01T00:00:00Z"), completedAt: new Date("2026-10-01T00:00:02Z") }];
  snapshot.inbox = [{ id: "rename", groupId: "official", cardNew: "25-云南-原名", cardOld: "25-云南-旧名", occurredAt: initialTime, receivedAt: initialTime }];
  const decision = decideGroupCardNickname(snapshot, [{ groupId: "official", card: "25-云南-原名", observedAt: initialTime }]);
  assert.equal(decision.nickname, "原名");
});

test("late original losing notice cannot roll back an already resolved batch", () => {
  const changed = initialTime;
  for (const sourceTime of [new Date(changed.getTime() - 10_000), null]) {
    const snapshot = user([group("source", { resolvedObservedCard: "25-云南-A", resolvedObservationSeq: 1, resolvedAt: changed }),
      group("official", { resolvedObservedCard: "25-云南-B", resolvedObservationSeq: 1, resolvedAt: changed })]);
    snapshot.nickname = "A";
    snapshot.nicknameChangedAt = changed;
    snapshot.sourceWorkspaceId = "workspace-source";
    snapshot.inbox = [{ id: "late-original", groupId: "official", cardNew: "25-云南-B", cardOld: "25-云南-X",
      occurredAt: sourceTime, receivedAt: new Date(changed.getTime() + 1_000) }];
    const result = decideGroupCardNickname(snapshot, [
      { groupId: "source", card: "25-云南-A", observedAt: new Date(changed.getTime() + 2_000) },
      { groupId: "official", card: "25-云南-B", observedAt: new Date(changed.getTime() + 2_000) },
    ]);
    assert.equal(result.nickname, undefined);
    assert.equal(result.inboxOutcomes?.[0].outcome, "resolved_baseline");
  }
});

test("a witnessed intermediate QQ value can prove a genuine new return to the same baseline", () => {
  const changed = initialTime;
  const snapshot = user([group("official", { resolvedObservedCard: "25-云南-B", resolvedObservationSeq: 1, resolvedAt: changed,
    observedCard: "25-云南-C", observedSeq: 2, observedAt: new Date(changed.getTime() + 1_000) })]);
  snapshot.nickname = "A";
  snapshot.inbox = [{ id: "return", groupId: "official", cardNew: "25-云南-B", cardOld: "25-云南-C",
    occurredAt: null, receivedAt: new Date(changed.getTime() + 2_000) }];
  assert.equal(decideGroupCardNickname(snapshot, [{ groupId: "official", card: "25-云南-B", observedAt: new Date(changed.getTime() + 3_000) }]).nickname, "B");
});

test("stale event cannot overwrite a newer website nickname", () => {
  const snapshot = user();
  snapshot.nicknameChangedAt = initialTime;
  snapshot.inbox = [{ id: "stale", groupId: "official", cardNew: "25-云南-过期", cardOld: "", occurredAt: new Date(initialTime.getTime() - 5_000), receivedAt: initialTime }];
  const result = decideGroupCardNickname(snapshot, [{ groupId: "official", card: "25-云南-过期", observedAt: initialTime }]);
  assert.equal(result.nickname, undefined);
  assert.equal(result.inboxOutcomes?.[0].outcome, "stale_event");
});

test("source-clock skew alone cannot reject a newly received verified QQ value", () => {
  const snapshot = user();
  snapshot.nicknameChangedAt = initialTime;
  snapshot.inbox = [{ id: "skew", groupId: "official", cardNew: "25-云南-QQ当前新名", cardOld: "", occurredAt: new Date(initialTime.getTime() - 5_000), receivedAt: new Date(initialTime.getTime() + 5_000) }];
  const result = decideGroupCardNickname(snapshot, [{ groupId: "official", card: "25-云南-QQ当前新名", observedAt: new Date(initialTime.getTime() + 5_000) }]);
  assert.equal(result.nickname, "QQ当前新名");
});

test("own old write callback is consumed without rolling back website nickname", () => {
  const snapshot = user();
  snapshot.attempts = [{ id: "own", groupId: "official", cardRevision: 0, targetCard: "25-云南-自己旧写",
    fromObservedCard: "25-云南-更旧", status: "superseded", startedAt: initialTime, completedAt: new Date(initialTime.getTime() + 2_000) }];
  snapshot.inbox = [{ id: "own-callback", groupId: "official", cardNew: "25-云南-自己旧写", cardOld: "25-云南-更旧", occurredAt: new Date(initialTime.getTime() + 1_000), receivedAt: new Date(initialTime.getTime() + 3_000) }];
  const result = decideGroupCardNickname(snapshot, [{ groupId: "official", card: "25-云南-自己旧写", observedAt: new Date(initialTime.getTime() + 3_000) }]);
  assert.equal(result.nickname, undefined);
  assert.equal(result.inboxOutcomes?.[0].outcome, "self_write");
});

test("long downtime retains unresolved old write proof, then reconciled proof is no blacklist", () => {
  const snapshot = user();
  snapshot.attempts = [{ id: "uncertain-old", groupId: "official", cardRevision: 0, targetCard: "25-云南-过去尝试的名",
    fromObservedCard: "25-云南-更旧", status: "unknown", startedAt: new Date("2026-10-01T00:00:00Z"), completedAt: new Date("2026-10-01T00:00:10Z") }];
  const observation = [{ groupId: "official", card: "25-云南-过去尝试的名", observedAt: initialTime }];
  assert.equal(decideGroupCardNickname(snapshot, observation).nickname, undefined);
  snapshot.attempts[0].status = "reconciled";
  snapshot.attempts[0].completedAt = initialTime;
  assert.equal(decideGroupCardNickname(snapshot, observation).nickname, "过去尝试的名");
});

test("unfinished old write does not consume a genuinely new later QQ event", () => {
  const snapshot = user();
  snapshot.attempts = [{ id: "unfinished", groupId: "official", cardRevision: 0, targetCard: "25-云南-历史名",
    fromObservedCard: "25-云南-更旧", status: "prepared", startedAt: new Date("2026-10-01T00:00:00Z"), completedAt: null }];
  snapshot.inbox = [{ id: "real-new", groupId: "official", cardNew: "25-云南-历史名", cardOld: "", occurredAt: initialTime, receivedAt: initialTime }];
  assert.equal(decideGroupCardNickname(snapshot, [{ groupId: "official", card: "25-云南-历史名", observedAt: initialTime }]).nickname, "历史名");
});

test("nearby manual rename with a different previous card is not mistaken for own write", () => {
  const snapshot = user();
  snapshot.attempts = [{ id: "nearby-own", groupId: "official", cardRevision: 0, targetCard: "25-云南-历史名",
    fromObservedCard: "25-云南-更旧", status: "superseded", startedAt: initialTime, completedAt: new Date(initialTime.getTime() + 1_000) }];
  snapshot.inbox = [{ id: "manual", groupId: "official", cardNew: "25-云南-历史名", cardOld: "25-云南-当前网站名", occurredAt: new Date(initialTime.getTime() + 1_000), receivedAt: new Date(initialTime.getTime() + 2_000) }];
  assert.equal(decideGroupCardNickname(snapshot, [{ groupId: "official", card: "25-云南-历史名", observedAt: new Date(initialTime.getTime() + 2_000) }]).nickname, "历史名");
});

test("nickname-looking card suffix is stripped once and preserved", () => {
  const result = decideGroupCardNickname(user(), [{ groupId: "official", card: "25-云南-24-北京-小明", observedAt: initialTime }]);
  assert.equal(result.nickname, "24-北京-小明");
});

test("empty, ambiguous and oversized QQ cards preserve website nickname", () => {
  for (const card of ["", "25·云南·小明", "某".repeat(31), "25-云南-"]) {
    assert.equal(decideGroupCardNickname(user(), [{ groupId: "official", card, observedAt: initialTime }]).nickname, undefined);
  }
});

test("ordinary numeric-prefix nicknames may contain spaces, emojis and punctuation", () => {
  for (const nickname of ["123 James", "42🎉", "42!cool", "42!cool!fun"]) {
    const result = decideGroupCardNickname(user(), [{ groupId: "official", card: nickname, observedAt: initialTime }]);
    assert.equal(result.nickname, nickname);
  }
});

test("empty website and QQ nicknames cannot be marked synchronized", async () => {
  for (const nickname of ["", "   "]) {
    const snapshot = user([group("official", { desiredCard: "", status: "failed", lastErrorCode: "NICKNAME_MISSING" })]);
    snapshot.nickname = nickname;
    const state = fixture(snapshot);
    await state.coordinator.processUser(snapshot.userId);
    assert.equal(snapshot.groups[0].status, "failed");
    assert.equal(snapshot.groups[0].confirmedRevision, null);
    assert.equal(state.finishes.length, 0);
    assert.equal(state.calls.writes.length, 0);
  }
});

test("valid QQ nickname can initialize an empty website nickname before confirmation", async () => {
  const snapshot = user([group("official", { desiredCard: "", status: "failed", lastErrorCode: "NICKNAME_MISSING" })]);
  snapshot.nickname = "";
  const state = fixture(snapshot);
  state.actual.set("official", "25-云南-有效QQ昵称");
  await state.coordinator.processUser(snapshot.userId);
  assert.equal(snapshot.nickname, "有效QQ昵称");
  assert.equal(snapshot.groups[0].status, "synced");
});

test("success response without matching readback is recorded as failed", async () => {
  const snapshot = user([group("official", { confirmedCard: "25-云南-过去", confirmedRevision: 0 })]);
  const state = fixture(snapshot);
  state.actual.set("official", "25-云南-过去");
  state.setIgnoreWrite(true);
  await state.coordinator.processUser(snapshot.userId);
  assert.equal(snapshot.groups[0].status, "failed");
  assert.equal(state.finishes[0].errorCode, "readback_mismatch");
  assert.equal(snapshot.groups[0].confirmedRevision, 0);
});

test("write timeout followed by matching readback is safely confirmed", async () => {
  const snapshot = user([group("official", { confirmedCard: "25-云南-过去", confirmedRevision: 0 })]);
  const state = fixture(snapshot);
  state.actual.set("official", "25-云南-过去");
  state.setWriteFailure(new Error("timed out"), true);
  await state.coordinator.processUser(snapshot.userId);
  assert.equal(snapshot.groups[0].status, "synced");
  assert.equal(state.finishes[0].status, "confirmed");
});

test("new website revision during remote write fences old confirmation", async () => {
  const snapshot = user([group("official", { confirmedCard: "25-云南-过去", confirmedRevision: 0 })]);
  const state = fixture(snapshot);
  state.actual.set("official", "25-云南-过去");
  state.setDuringWrite(() => {
    snapshot.nickname = "网站最新";
    snapshot.cardRevision++;
    snapshot.nicknameRevision++;
    snapshot.groups[0].desiredCardRevision = snapshot.cardRevision;
    snapshot.groups[0].desiredCard = "25-云南-网站最新";
    snapshot.groups[0].status = "pending";
  });
  await state.coordinator.processUser(snapshot.userId);
  assert.equal(snapshot.groups[0].status, "pending");
  assert.equal(snapshot.groups[0].desiredCard, "25-云南-网站最新");
  assert.equal(snapshot.attempts[0].status, "superseded");
});

test("QQ rename between batch read and write is requeued without overwriting it", async () => {
  const snapshot = user([group("official", { confirmedCard: "25-云南-过去", confirmedRevision: 0 })]);
  const state = fixture(snapshot);
  state.actual.set("official", "25-云南-过去");
  state.setDuringRead((groupId, count) => {
    if (count === 2) state.actual.set(groupId, "25-云南-刚刚改的QQ昵称");
  });
  await state.coordinator.processUser(snapshot.userId);
  assert.equal(state.calls.writes.length, 0);
  assert.equal(state.failures[0].code, "observation_changed");
  assert.equal(state.actual.get("official"), "25-云南-刚刚改的QQ昵称");
});

test("all coordinator calls share two-call concurrency and two-per-second start limits", async () => {
  const state = fixture(user([group("official"), group("partner")]));
  const starts: number[] = [];
  let active = 0;
  let peak = 0;
  async function counted<T>(call: () => Promise<T>): Promise<T> {
    starts.push(state.getTime().getTime());
    active++;
    peak = Math.max(peak, active);
    try {
      await new Promise<void>((resolve) => setImmediate(resolve));
      return await call();
    } finally { active--; }
  }
  const originalInfo = state.client.getGroupMemberInfo;
  const originalList = state.client.getGroupMemberList;
  state.client.getGroupMemberInfo = (...args) => counted(() => originalInfo(...args));
  state.client.getGroupMemberList = (...args) => counted(() => originalList(...args));
  await Promise.all([state.coordinator.processUser("user-1"), state.coordinator.reconcile(), state.coordinator.reconcile()]);
  assert.equal(peak, 2);
  for (const at of starts) assert.ok(starts.filter((other) => other >= at && other < at + 1_000).length <= 2);
});

test("lease loss after remote write leaves confirmation pending", async () => {
  const snapshot = user([group("official", { confirmedCard: "25-云南-过去", confirmedRevision: 0 })]);
  const state = fixture(snapshot);
  state.actual.set("official", "25-云南-过去");
  state.setDuringWrite(() => { state.setLeaseValid(false); });
  await state.coordinator.processUser(snapshot.userId);
  assert.equal(state.finishes.length, 0);
  assert.equal(snapshot.groups[0].confirmedRevision, 0);
});

test("concurrent coordinators cannot process the same leased user", async () => {
  const state = fixture();
  await Promise.all([state.coordinator.processUser("user-1"), state.coordinator.processUser("user-1")]);
  assert.equal(state.calls.claims, 2);
  assert.equal(state.decisions.length, 1);
});

test("one group read failure retains its inbox while healthy QQ rename proceeds", async () => {
  const snapshot = user([group("broken"), group("official")]);
  snapshot.inbox = [{ id: "broken-event", groupId: "broken", cardNew: "25-云南-无法读取", cardOld: "", occurredAt: initialTime, receivedAt: initialTime }];
  const state = fixture(snapshot);
  state.readFailures.set("broken", new Error("forbidden: permission denied"));
  state.actual.set("official", "25-云南-健康群新名");
  await state.coordinator.processUser(snapshot.userId);
  assert.equal(snapshot.nickname, "健康群新名");
  assert.equal(snapshot.inbox[0].id, "broken-event");
  assert.equal(state.failures[0].code, "permission_denied");
});

test("observe mode records differences without accepting nickname, resolving baseline or writing QQ", async () => {
  const snapshot = user();
  snapshot.inbox = [{ id: "event", groupId: "official", cardNew: "25-云南-QQ新名", cardOld: "", occurredAt: initialTime, receivedAt: initialTime }];
  const state = fixture(snapshot, "observe");
  state.actual.set("official", "25-云南-QQ新名");
  await state.coordinator.processUser(snapshot.userId);
  assert.equal(snapshot.nickname, "旧名");
  assert.equal(snapshot.inbox.length, 1);
  assert.equal(snapshot.groups[0].resolvedObservedCard, null);
  assert.equal(snapshot.groups[0].observedCard, "25-云南-QQ新名");
  assert.equal(state.calls.writes.length, 0);
});

test("off mode performs no external or repository operations", async () => {
  const state = fixture(user(), "off");
  await state.coordinator.tick();
  await state.coordinator.processUser("user-1");
  assert.equal(state.calls.status, 0);
  assert.equal(state.calls.claims, 0);
  assert.equal(state.calls.refreshed, 0);
  assert.equal(state.calls.health.length, 0);
});

test("offline login suspends delivery and retries only after online recovery", async () => {
  const state = fixture();
  state.setOnline(false);
  await state.coordinator.tick();
  assert.equal(state.calls.claims, 0);
  assert.equal(state.calls.health[0].online, false);
  assert.equal(state.snapshot.groups[0].attemptCount, 0);
  state.setOnline(true);
  state.setTime(new Date(initialTime.getTime() + 30_000));
  await state.coordinator.tick();
  assert.equal(state.calls.resumed, 1);
  assert.equal(state.calls.health[1].online, true);
  assert.equal(state.calls.reconciled.length, 1);
});

test("health is checked at most once in thirty seconds", async () => {
  const state = fixture();
  await state.coordinator.tick();
  state.setTime(new Date(initialTime.getTime() + 5_000));
  await state.coordinator.tick();
  assert.equal(state.calls.status, 1);
  assert.equal(state.calls.health.length, 1);
  state.setTime(new Date(initialTime.getTime() + 30_000));
  await state.coordinator.tick();
  assert.equal(state.calls.status, 2);
  assert.equal(state.calls.health.length, 2);
});

test("failed QQ health is persisted with its error and no delivery attempts", async () => {
  const state = fixture();
  state.client.getStatus = async () => { throw new Error("NapCat authentication failed"); };
  await state.coordinator.tick();
  assert.equal(state.calls.health.length, 1);
  assert.equal(state.calls.health[0].online, false);
  assert.equal(state.calls.health[0].error, "NapCat authentication failed");
  assert.equal(state.calls.claims, 0);
});

test("birthday targets refresh at startup and after Shanghai 00:05", async () => {
  const state = fixture();
  state.setOnline(false);
  state.setTime(new Date("2026-10-10T15:59:00Z"));
  await state.coordinator.tick();
  assert.equal(state.calls.refreshed, 1);
  state.setTime(new Date("2026-10-10T16:02:00Z"));
  await state.coordinator.tick();
  assert.equal(state.calls.refreshed, 1);
  state.setTime(new Date("2026-10-10T16:05:00Z"));
  await state.coordinator.tick();
  assert.equal(state.calls.refreshed, 2);
});

test("empty member list is never used as a reconciliation baseline", async () => {
  const state = fixture();
  state.setMemberListEmpty();
  await state.coordinator.reconcile();
  assert.equal(state.calls.reconciled.length, 0);
});
