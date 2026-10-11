import test from "node:test";
import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import path from "node:path";
import { NextRequest } from "next/server";

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
type Loader = { _load(request: string, parent: NodeModule | null, isMain: boolean): unknown };
const requireModule = createRequire(__filename);
class Conflict extends Error {
  constructor(public readonly currentNickname: string, public readonly currentRevision: number) { super("conflict"); }
}

/** Load the actual route with isolated dependencies; no database or QQ calls. */
function route(file: string, dependencies: Record<string, unknown>): { POST: Handler; GET: Handler; PUT: Handler } {
  const loader = Module as unknown as Loader;
  const original = loader._load;
  loader._load = function (request, parent, isMain) {
    return request in dependencies ? dependencies[request] : original.call(this, request, parent, isMain);
  };
  const filename = path.resolve(file);
  try {
    delete requireModule.cache[filename];
    return requireModule(filename) as { POST: Handler; GET: Handler; PUT: Handler };
  } finally {
    loader._load = original;
  }
}

const context = { params: Promise.resolve({ id: "workspace-1" }) };
const noop = () => {};
const logger = { info: noop, debug: noop, warn: noop, error: noop };
const baseDependencies = {
  "@/lib/api-handler": {
    apiHandler: (handler: Handler) => handler,
    parseJsonRequest: (req: Request) => req.json(),
  },
  "@/lib/logger": { logger, createLogger: () => logger },
};

function nicknameFixture(failQueue = false) {
  let state = { nickname: "来自 QQ", revision: 2, tasks: 0 };
  let staged = { ...state };
  const tx = { tag: "transaction" };
  const inputs: Array<{ nickname?: string; baseNicknameRevision?: number; force?: boolean }> = [];
  const dependencies = {
    ...baseDependencies,
    "@/lib/auth": { requireAuth: async () => ({ id: "user-1" }) },
    "@/lib/db": { db: { $transaction: async (callback: (client: unknown) => Promise<unknown>) => {
      staged = { ...state };
      const result = await callback(tx);
      state = staged;
      return result;
    } } },
    "@/server/bot/group-card-sync.service": {
      NicknameRevisionConflictError: Conflict,
      queueGroupCardSyncInTransaction: async (client: unknown, userId: string, options: { nickname?: string; baseNicknameRevision?: number; force?: boolean }) => {
        assert.equal(client, tx);
        assert.equal(userId, "user-1");
        inputs.push(options);
        if (options.baseNicknameRevision !== undefined && options.baseNicknameRevision !== state.revision) {
          throw new Conflict(state.nickname, state.revision);
        }
        staged.nickname = "新昵称";
        staged.revision++;
        if (failQueue) throw new Error("Outbox insert unavailable");
        staged.tasks++;
        return { nickname: staged.nickname, nicknameRevision: staged.revision, desiredCard: `25-云南-${staged.nickname}` };
      },
      getGroupCardSyncView: async () => ({
        nickname: state.nickname, nicknameRevision: state.revision,
        groupCardSync: { status: "pending", nicknameRevision: state.revision, groups: [{ desiredCard: `25-云南-${state.nickname}` }] },
      }),
    },
  };
  return { ...route("src/app/api/account/nickname/route.ts", dependencies), inputs, current: () => state };
}

function request(body: unknown, extraHeaders: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/test", {
    method: "POST", headers: { "Content-Type": "application/json", ...extraHeaders }, body: JSON.stringify(body),
  });
}

test("nickname route passes raw input to one transactional mutation and returns pending honestly", async () => {
  const fixture = nicknameFixture();
  const response = await fixture.POST(request({ nickname: "25-云南-新昵称", baseNicknameRevision: 2 }), context);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(fixture.inputs[0].nickname, "25-云南-新昵称");
  assert.equal(fixture.inputs[0].force, true);
  assert.deepEqual(fixture.current(), { nickname: "新昵称", revision: 3, tasks: 1 });
  assert.equal(body.data.groupSynced, false);
  assert.equal(body.data.groupCardSync.status, "pending");
  assert.match(body.data.message, /等待同步/);
});

test("nickname route preserves the current name and version on a stale editor conflict", async () => {
  const fixture = nicknameFixture();
  const response = await fixture.POST(request({ nickname: "旧页面昵称", baseNicknameRevision: 1 }), context);
  const body = await response.json();
  assert.equal(response.status, 409);
  assert.equal(body.error.code, "NICKNAME_CONFLICT");
  assert.equal(body.error.currentNickname, "来自 QQ");
  assert.equal(body.error.currentRevision, 2);
  assert.deepEqual(fixture.current(), { nickname: "来自 QQ", revision: 2, tasks: 0 });
});

test("outbox insertion failure cannot commit the website nickname mutation", async () => {
  const fixture = nicknameFixture(true);
  await assert.rejects(fixture.POST(request({ nickname: "新昵称", baseNicknameRevision: 2 }), context), /Outbox insert unavailable/);
  assert.deepEqual(fixture.current(), { nickname: "来自 QQ", revision: 2, tasks: 0 });
});

function webhookFixture(failPersistence: boolean) {
  let redisMarkers = 0;
  const accepted: unknown[] = [];
  const dependencies = {
    ...baseDependencies,
    "@/server/bot/bot.config": { BOT_CONFIG: { webhookToken: "test-token" }, isTargetGroup: () => true },
    "@/server/bot/clients/napcat.client": { napcatClient: {} },
    "@/lib/redis": { redis: { set: async () => { redisMarkers++; return "OK"; } } },
    "@/lib/db": { db: {} },
    "@/lib/workspace-auth": { workspaceForGroup: async () => ({ id: "workspace-1", botEnabled: true }), isWorkspaceOperational: () => true },
    "@/server/bot/group-card-sync.service": {
      syncMembershipGroupCardsInTransaction: async () => {},
      acceptGroupCardEvent: async (event: unknown) => {
        accepted.push(event);
        if (failPersistence) throw new Error("Inbox database unavailable");
        return { duplicate: true };
      },
    },
    "@/server/bot/bot-audit.service": { logBotEvent: async () => {} },
    "@/server/bot/register-command.handler": { handleRegisterCommand: async () => {} },
    "@/server/bot/password-reset-command.handler": { handlePasswordResetCommand: async () => {} },
    "@/server/bot/group-member-joined.handler": { handleGroupMemberJoined: async () => {} },
    "@/server/bot/group-member-left.handler": { handleGroupMemberLeft: async () => {} },
  };
  // The real thin handler retains service functions in its module closure.
  delete requireModule.cache[path.resolve("src/server/bot/group-card-changed.handler.ts")];
  return { ...route("src/app/api/bot/napcat/webhook/route.ts", dependencies), accepted, markers: () => redisMarkers };
}

const cardNotice = { post_type: "notice", notice_type: "group_card", self_id: 10, group_id: 20, user_id: 30,
  card_old: "25-云南-旧昵称", card_new: "", time: 1791676800 };

test("card webhook returns 503 when durable persistence fails and does not poison Redis dedup", async () => {
  const fixture = webhookFixture(true);
  const response = await fixture.POST(request(cardNotice, { "x-bot-token": "test-token" }), context);
  assert.equal(response.status, 503);
  assert.equal(fixture.markers(), 0);
  assert.equal(fixture.accepted.length, 1);
});

test("durably duplicated card notices are safely acknowledged without a Redis marker", async () => {
  const fixture = webhookFixture(false);
  const response = await fixture.POST(request(cardNotice, { "x-bot-token": "test-token" }), context);
  assert.equal(response.status, 200);
  assert.equal(fixture.markers(), 0);
  assert.equal(fixture.accepted.length, 1);
});

function monitoringFixture(online: boolean, healthAgeMs = 0, showExcluded = false) {
  const now = new Date();
  const scanAt = new Date(now.getTime() - 30 * 60_000);
  const countedQueries: Array<Record<string, unknown>> = [];
  const dependencies = {
    ...baseDependencies,
    "@/lib/auth": { requireRole: async () => ({ id: "admin-1", role: "ADMIN" }) },
    "@/server/bot/group-card-sync.service": {},
    "@/lib/db": { db: {
      workspace: { findUnique: async () => ({ id: "workspace-1", status: "ACTIVE", botEnabled: true, expiresAt: null }) },
      groupCardSyncState: {
        findMany: async () => showExcluded ? [{
          userId: "excluded-user", qqNumber: "30003", desiredCard: "25-云南-Excluded", observedCard: "Different",
          confirmedCard: null, status: "pending", lastErrorCode: null, lastError: null, syncedAt: null, updatedAt: now,
          user: { authIdentities: [{ nickname: "Excluded" }] },
        }, {
          userId: "excluded-drift", qqNumber: "30004", desiredCard: "25-云南-Drift", observedCard: "ChangedAfterConfirmation",
          confirmedCard: "25-云南-Drift", confirmedRevision: 1, desiredCardRevision: 1,
          status: "synced", lastErrorCode: null, lastError: null, syncedAt: now, updatedAt: now,
          user: { authIdentities: [{ nickname: "Drift" }] },
        }] : [],
        aggregate: async (query: { _count?: unknown; where: Record<string, unknown> }) => {
          if (!query._count) return { _max: { observedAt: now }, _min: { createdAt: new Date(now.getTime() - 60 * 60_000) } };
          countedQueries.push(query.where);
          return { _count: query.where.userId ? 1 : 4, _min: { pendingSince: new Date(now.getTime() - 11 * 60_000) } };
        },
        count: async (query: { where: { status: string; userId?: unknown } }) => {
          countedQueries.push(query.where);
          return query.where.userId ? query.where.status === "paused" ? 1 : 0 : query.where.status === "paused" ? 3 : 2;
        },
      },
      systemConfig: { findUnique: async (query: { where: { key: string } }) => query.where.key === "botOpen"
        ? { value: true }
        : { value: { online, checkedAt: new Date(now.getTime() - healthAgeMs).toISOString() } } },
      workspaceLog: { findFirst: async () => ({ createdAt: scanAt }) },
    } },
  };
  return { ...route("src/app/api/admin/group-card-sync/route.ts", dependencies), now, scanAt, countedQueries };
}

test("monitoring counts all blocked users and distinguishes full scans from recent observations", async () => {
  const previous = process.env.GROUP_CARD_SYNC_MODE;
  process.env.GROUP_CARD_SYNC_MODE = "active";
  try {
    const fixture = monitoringFixture(true);
    const response = await fixture.GET(new NextRequest("http://localhost/api/admin/test"), context);
    const body = await response.json();
    assert.equal(body.data.states.length, 0);
    assert.equal(body.data.metrics.blockedCount, 3);
    assert.equal(body.data.metrics.failedCount, 2);
    assert.equal(body.data.metrics.lastReconciledAt, fixture.scanAt.toISOString());
    assert.equal(body.data.metrics.lastObservedAt, fixture.now.toISOString());
    assert.equal(body.data.metrics.online, true);
    assert.ok(body.data.metrics.alerts.some((alert: string) => alert.includes("10 分钟")));
    assert.ok(body.data.metrics.alerts.some((alert: string) => alert.includes("20 分钟")));
    assert.ok(body.data.metrics.alerts.some((alert: string) => alert.includes("权限")));
  } finally {
    if (previous === undefined) delete process.env.GROUP_CARD_SYNC_MODE;
    else process.env.GROUP_CARD_SYNC_MODE = previous;
  }
});

test("observe, off, offline, and stale health do not emit active delivery backlog alerts", async () => {
  const previous = process.env.GROUP_CARD_SYNC_MODE;
  try {
    for (const scenario of [
      { mode: "observe", online: true, age: 0 }, { mode: "off", online: true, age: 0 },
      { mode: "active", online: false, age: 0 }, { mode: "active", online: true, age: 91_000 },
    ]) {
      process.env.GROUP_CARD_SYNC_MODE = scenario.mode;
      const fixture = monitoringFixture(scenario.online, scenario.age);
      const body = await (await fixture.GET(new NextRequest("http://localhost/api/admin/test"), context)).json();
      assert.deepEqual(body.data.metrics.alerts, [], JSON.stringify(scenario));
      if (scenario.age > 90_000) assert.equal(body.data.metrics.online, null);
    }
  } finally {
    if (previous === undefined) delete process.env.GROUP_CARD_SYNC_MODE;
    else process.env.GROUP_CARD_SYNC_MODE = previous;
  }
});

function signupFixture(existing: boolean) {
  const calls: string[] = [];
  let createdNickname: string | null = null;
  let identityUpdate: Record<string, unknown> = {};
  const user = { id: "user-1", role: "USER", sourceWorkspaceId: "workspace-1" };
  const currentNickname = "网站当前昵称";
  const contextNickname = "25-云南-昵称本身";
  const assertLocked = () => { if (existing) assert.ok(calls.includes("lock")); };
  const tx = {
    user: {
      findUnique: async () => existing ? user : null,
      create: async (query: { data: { authIdentities: { create: { nickname: string } } } }) => {
        createdNickname = query.data.authIdentities.create.nickname; return user;
      },
      update: async () => { assertLocked(); calls.push("user_write"); return user; },
    },
    workspaceMember: { upsert: async () => { assertLocked(); calls.push("membership_write"); } },
    groupMembership: { findUnique: async () => ({ id: "membership-1" }) },
    authIdentity: {
      findFirst: async () => ({ nickname: currentNickname }),
      upsert: async (query: { update: Record<string, unknown> }) => { assertLocked(); identityUpdate = query.update; },
    },
    botIdentity: { updateMany: async () => {} },
  };
  const dependencies = {
    ...baseDependencies,
    "@/lib/db": { db: { $transaction: async (callback: (client: unknown) => Promise<unknown>) => callback(tx),
      profile: { findUnique: async () => null } } },
    "@/lib/redis": { redis: { get: async () => JSON.stringify({ groupId: "group-1", nickname: contextNickname }), del: async () => {} } },
    "@/lib/verification": { consumeVerifiedFlag: async () => true },
    "@/lib/password": { validatePasscode: () => ({ valid: true }), hashPassword: async () => "test-hash" },
    "@/lib/session": { createSession: async () => {} },
    "@/lib/audit": { logAudit: async () => {}, getClientIp: () => "127.0.0.1", AUDIT_ACTIONS: { LOGIN: "LOGIN" } },
    "@/lib/workspace-auth": {
      workspaceForGroup: async () => ({ id: "workspace-1", qqGroupId: "group-1" }), isWorkspaceOperational: () => true,
    },
    "@/lib/rating-profile-sync": { lockRatingUserTasks: async () => { calls.push("lock"); } },
    "@/server/bot/group-card-sync.service": {
      queueGroupCardSyncInTransaction: async (client: unknown, _userId: string, options: { nickname?: string }) => {
        assert.equal(client, tx); assertLocked(); assert.equal(options.nickname, undefined);
        return { nickname: existing ? currentNickname : createdNickname };
      },
      getGroupCardSyncView: async () => ({ nickname: existing ? currentNickname : createdNickname, nicknameRevision: 2, groupCardSync: {} }),
    },
  };
  return { ...route("src/app/api/auth/set-passcode/route.ts", dependencies), calls,
    created: () => createdNickname, update: () => identityUpdate, contextNickname, currentNickname };
}

test("existing signup locks before writes and does not replace the current nickname with old context", async () => {
  const fixture = signupFixture(true);
  const response = await fixture.POST(request({ qqNumber: "123456789", passcode: "test-passcode" }), context);
  assert.equal(response.status, 200);
  assert.equal(fixture.calls[0], "lock");
  assert.equal(fixture.update().nickname, undefined);
  assert.equal((await response.json()).data.nickname, fixture.currentNickname);
});

test("new signup preserves the already-extracted nickname even when it resembles a full card", async () => {
  const fixture = signupFixture(false);
  const response = await fixture.POST(request({ qqNumber: "123456789", passcode: "test-passcode" }), context);
  assert.equal(response.status, 200);
  assert.equal(fixture.created(), fixture.contextNickname);
  assert.equal((await response.json()).data.nickname, fixture.contextNickname);
});

function internalFixture(synced: boolean) {
  const queued: Array<{ force?: boolean; workspaceId?: string }> = [];
  const targetCard = "25-云南-当前昵称";
  const summary = { status: synced ? "synced" : "pending", groups: [{
    groupId: "group-1", desiredCard: targetCard, confirmedCard: targetCard,
    status: synced ? "synced" : "pending",
  }] };
  const dependencies = {
    ...baseDependencies,
    "@/server/bot/bot.config": { BOT_CONFIG: { internalSecret: "internal-test-token" } },
    "@/lib/db": { db: {
      user: { findUnique: async () => ({ id: "user-1", status: "ACTIVE" }) },
      workspace: { findUnique: async () => ({ id: "workspace-1" }) },
      workspaceMember: { findUnique: async () => ({ leftAt: null }) },
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback({ tag: "transaction" }),
    } },
    "@/server/bot/group-card-sync.service": {
      getGroupCardSyncSummary: async () => summary,
      queueGroupCardSyncInTransaction: async (_tx: unknown, _id: string, options: { force?: boolean; workspaceId?: string }) => {
        queued.push(options); return { desiredCard: targetCard };
      },
    },
    "@/server/bot/bot-audit.service": {
      logBotAudit: async () => {}, BOT_AUDIT_ACTIONS: { BOT_GROUP_CARD_UPDATE_ATTEMPTED: "attempted" },
    },
    "@/server/bot/clients/napcat.client": { napcatClient: { setGroupCard: async () => { throw new Error("Direct QQ writes are forbidden"); } } },
  };
  return { ...route("src/app/api/internal/bot/group-card/update/route.ts", dependencies), queued, targetCard };
}

test("internal card update returns success only for a confirmed current target without requeueing", async () => {
  const fixture = internalFixture(true);
  const response = await fixture.POST(request({ groupId: "group-1", qqNumber: "123456789", targetCard: fixture.targetCard },
    { "x-internal-secret": "internal-test-token" }), context);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.data.success, true);
  assert.equal(body.data.queued, false);
  assert.equal(fixture.queued.length, 1);
  assert.equal(fixture.queued[0].force, false);
});

test("internal queued delivery remains pending even when an earlier confirmation has the same card", async () => {
  const fixture = internalFixture(false);
  const response = await fixture.POST(request({ groupId: "group-1", qqNumber: "123456789", targetCard: fixture.targetCard },
    { "x-internal-secret": "internal-test-token" }), context);
  const body = await response.json();
  assert.equal(response.status, 202);
  assert.equal(body.data.success, false);
  assert.equal(body.data.queued, true);
  assert.deepEqual(fixture.queued.map((call) => call.force), [false, true]);
  assert.ok(fixture.queued.every((call) => call.workspaceId === "workspace-1"));
});

test("workspace retry response exposes only the manageable group's status and verification time", async () => {
  const summary = { status: "partial", nicknameRevision: 8, cardRevision: 10, lastVerifiedAt: "2026-10-01T00:00:00Z", groups: [
    { workspaceId: "workspace-1", groupId: "own", status: "pending", lastVerifiedAt: null },
    { workspaceId: "workspace-2", groupId: "private-other", status: "synced", lastVerifiedAt: "2026-10-01T00:00:00Z" },
  ] };
  const fixture = route("src/app/api/admin/group-card-sync/route.ts", {
    ...baseDependencies,
    "@/lib/db": { db: {
      workspace: { findUnique: async () => ({ id: "workspace-1" }) },
      workspaceMember: { findUnique: async () => ({ userId: "user-1", leftAt: null }) },
    } },
    "@/lib/auth": { requireRole: async () => ({ id: "admin-1", role: "ADMIN" }) },
    "@/server/bot/group-card-sync.service": { retryGroupCardSync: async () => summary },
  });
  const response = await fixture.POST(request({ action: "retry", userId: "user-1" }), context);
  const scoped = (await response.json()).data.groupCardSync;
  assert.equal(scoped.groups.length, 1);
  assert.equal(scoped.groups[0].groupId, "own");
  assert.equal(scoped.status, "pending");
  assert.equal(scoped.lastVerifiedAt, null);
  assert.equal(scoped.nicknameRevision, 8);
  assert.equal(scoped.cardRevision, 10);
});

test("active canary monitoring counts only enabled users and marks other displayed differences paused", async () => {
  const previousMode = process.env.GROUP_CARD_SYNC_MODE;
  const previousUsers = process.env.GROUP_CARD_SYNC_USER_IDS;
  process.env.GROUP_CARD_SYNC_MODE = "active";
  process.env.GROUP_CARD_SYNC_USER_IDS = "selected-user";
  try {
    const fixture = monitoringFixture(true, 0, true);
    const body = await (await fixture.GET(new NextRequest("http://localhost/api/admin/test"), context)).json();
    assert.equal(body.data.metrics.pendingCount, 1);
    assert.equal(body.data.metrics.blockedCount, 1);
    assert.equal(body.data.metrics.failedCount, 0);
    assert.ok(fixture.countedQueries.every((query) => JSON.stringify(query.userId) === JSON.stringify({ in: ["selected-user"] })));
    assert.equal(body.data.states[0].status, "paused");
    assert.match(body.data.states[0].reason, /灰度/);
    assert.equal(body.data.states[1].status, "paused");
    delete process.env.GROUP_CARD_SYNC_USER_IDS;
    const allEnabled = await (await fixture.GET(new NextRequest("http://localhost/api/admin/test"), context)).json();
    assert.equal(allEnabled.data.states[1].status, "pending");
  } finally {
    if (previousMode === undefined) delete process.env.GROUP_CARD_SYNC_MODE;
    else process.env.GROUP_CARD_SYNC_MODE = previousMode;
    if (previousUsers === undefined) delete process.env.GROUP_CARD_SYNC_USER_IDS;
    else process.env.GROUP_CARD_SYNC_USER_IDS = previousUsers;
  }
});

function profileFixture(stopAfterValidation = false) {
  const dependencies = {
    ...baseDependencies,
    "@/lib/auth": { requireAuth: async () => ({ id: "user-1", role: "USER" }) },
    "@/lib/db": { db: { user: { findUnique: async () => {
      if (stopAfterValidation) throw new Error("PROFILE_VALIDATION_PASSED");
      return { profile: null, preference: null, ratingProfile: null, lastProfileClearedAt: null };
    } } } },
    "@/lib/validations/profile": { profileFormSchema: { safeParse: (body: unknown) => ({ success: true, data: body }) },
      CLEAR_COOLDOWN_DAYS: 30, EDIT_COOLDOWN_DAYS: 7, PHOTO_REVOKE_REPUBLISH_COOLDOWN_MS: 5 * 60 * 60_000 },
    "@/lib/notifications": { notify: {} },
    "@/lib/scoring-revocation": { commitExpiredActions: async () => {} },
    "@/lib/rating-task-queue": {}, "@/lib/profile-draft": {}, "@/lib/user-cooldowns": {}, "@/lib/scoring": {},
    "@/lib/session": {}, "@/lib/audit": {},
    "@/server/bot/group-card-sync.service": {
      NicknameRevisionConflictError: Conflict,
      getGroupCardSyncView: async () => ({ nickname: "25-北京-", nicknameRevision: 6, groupCardSync: { status: "pending", nicknameRevision: 6 } }),
    },
  };
  return route("src/app/api/profile/me/route.ts", dependencies);
}

test("profile GET returns the authoritative nickname version and disables response caching", async () => {
  const fixture = profileFixture();
  const response = await fixture.GET(new NextRequest("http://localhost/api/profile/me"), context);
  const body = await response.json();
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(body.data.nickname, "25-北京-");
  assert.equal(body.data.nicknameRevision, 6);
  assert.equal(body.data.groupCardSync.nicknameRevision, 6);
});

test("profile PUT does not reject a canonical nickname by parsing it again before the transaction", async () => {
  const fixture = profileFixture(true);
  await assert.rejects(fixture.PUT(request({ nickname: "25-北京-", profile: { status: "DRAFT", attribute: "ONE" }, preference: {} }), context), /PROFILE_VALIDATION_PASSED/);
});

test("personal retry forwards its optional workspace scope, keeps no-body compatibility, and rejects invalid scope", async () => {
  const scopes: Array<string | undefined> = [];
  const fixture = route("src/app/api/account/group-card-sync/route.ts", {
    ...baseDependencies,
    "@/lib/auth": { requireAuth: async () => ({ id: "user-1" }) },
    "@/server/bot/group-card-sync.service": {
      retryGroupCardSync: async (userId: string, workspaceId?: string) => {
        assert.equal(userId, "user-1"); scopes.push(workspaceId); return { status: "pending" };
      },
    },
  });
  assert.equal((await fixture.POST(request({ workspaceId: "workspace-1" }), context)).status, 202);
  assert.equal((await fixture.POST(new NextRequest("http://localhost/api/account/group-card-sync", { method: "POST" }), context)).status, 202);
  assert.equal((await fixture.POST(request({ workspaceId: { id: "workspace-1" } }), context)).status, 422);
  assert.deepEqual(scopes, ["workspace-1", undefined]);
});

test("profile clear deletes the live profile and schedules its new target inside one locked transaction", async () => {
  const calls: string[] = [];
  const tx = {
    ratingTask: { deleteMany: async () => {} }, ratingProfile: { deleteMany: async () => {} },
    preference: { deleteMany: async () => {} }, profile: { delete: async () => { calls.push("profile_deleted"); } },
    user: { update: async () => {} },
  };
  const fixture = route("src/app/api/profile/clear/route.ts", {
    ...baseDependencies,
    "@/lib/auth": { requireAuth: async () => ({ id: "user-1", role: "USER" }) },
    "@/lib/db": { db: { profile: { findUnique: async () => ({ id: "profile-1" }) },
      $transaction: async (callback: (client: unknown) => Promise<unknown>) => callback(tx) } },
    "@/lib/rating-profile-sync": { lockRatingUserTasks: async () => { calls.push("lock"); } },
    "@/lib/validations/profile": { CLEAR_COOLDOWN_DAYS: 30 },
    "@/lib/audit": { logAudit: async () => {}, getClientIp: () => "127.0.0.1", AUDIT_ACTIONS: { PROFILE_CLEAR: "clear" } },
    "@/server/bot/group-card-sync.service": {
      queueGroupCardSyncInTransaction: async (client: unknown, userId: string, options: { source?: string }) => {
        assert.equal(client, tx); assert.equal(userId, "user-1"); assert.equal(options.source, "website_profile_clear"); calls.push("queued");
      },
      getGroupCardSyncSummary: async () => ({ status: "pending" }),
    },
  });
  assert.equal((await fixture.POST(request({}), context)).status, 200);
  assert.deepEqual(calls, ["lock", "profile_deleted", "queued"]);
});

function enrollmentFixture(file: string) {
  const calls: string[] = [];
  const tx = {
    workspaceMember: { upsert: async () => { assert.equal(calls[0], "lock"); calls.push("membership"); } },
    adminReview: { updateMany: async () => { calls.push("reviews"); } },
  };
  const synchronization = { syncMembershipGroupCardsInTransaction: async (client: unknown, userId: string) => {
    assert.equal(client, tx); assert.equal(userId, "user-1"); calls.push("queued");
  } };
  const audit = { logBotAudit: async () => {}, logBotAction: async () => {}, BOT_AUDIT_ACTIONS: {} };
  const dependencies = {
    ...baseDependencies,
    "@/lib/db": { db: { user: { findFirst: async () => ({ id: "user-1", status: "ACTIVE", passwordHash: "test-hash" }) },
      $transaction: async (callback: (client: unknown) => Promise<unknown>) => callback(tx) } },
    "@/lib/rating-profile-sync": { lockRatingUserTasks: async () => { calls.push("lock"); } },
    "@/server/bot/group-card-sync.service": synchronization, "./group-card-sync.service": synchronization,
    "@/lib/workspace-auth": { workspaceForGroup: async () => ({ id: "workspace-1", botEnabled: true }), isWorkspaceOperational: () => true },
    "@/lib/redis": { redis: {} }, "@/lib/verification": {}, "@/lib/email": {}, "@/lib/email-quota": {}, "@/lib/audit": {},
    "./bot.config": { getQQEmail: () => "30003@qq.com" },
    "./bot-command-result": { getReplyMessage: (result: { code: string }) => result.code },
    "./bot-rate-limiter": { checkBotRateLimit: async () => ({ allowed: true }) },
    "./avatar-sync.service": { syncAvatar: async () => {} }, "./bot-audit.service": audit,
  };
  return { ...route(file, dependencies), calls };
}

test("already-registered bot signup enrolls and queues membership in one locked transaction", async () => {
  const previous = process.env.BOT_INTERNAL_SECRET;
  process.env.BOT_INTERNAL_SECRET = "test-enrollment-secret";
  try {
    const fixture = enrollmentFixture("src/app/api/auth/bot-signup/route.ts");
    const response = await fixture.POST(request({ qqNumber: "30003", groupId: "20002" }, { "x-bot-secret": "test-enrollment-secret" }), context);
    assert.equal((await response.json()).data.status, "already_registered");
    assert.deepEqual(fixture.calls, ["lock", "membership", "queued"]);
  } finally {
    if (previous === undefined) delete process.env.BOT_INTERNAL_SECRET;
    else process.env.BOT_INTERNAL_SECRET = previous;
  }
});

test("registered QQ command enrolls in a second workspace with the same locked outbox boundary", async () => {
  const fixture = enrollmentFixture("src/server/bot/register-command.handler.ts") as unknown as {
    calls: string[]; handleRegisterCommand(event: unknown, client: unknown): Promise<void>;
  };
  const replies: string[] = [];
  await fixture.handleRegisterCommand({ qqNumber: "30003", groupId: "20002" }, {
    getGroupMemberInfo: async () => ({ card: "25-云南-Before", nickname: "PersonalQQ", avatarUrl: "" }),
    sendGroupMessage: async (_groupId: string, message: { content: string }) => { replies.push(message.content); },
  });
  assert.deepEqual(fixture.calls, ["lock", "membership", "queued"]);
  assert.deepEqual(replies, ["ALREADY_REGISTERED"]);
});

function legacyReviewFixture(action: "restore" | "confirm-left") {
  const calls: string[] = [];
  let membershipStatus = "LEFT_PENDING_REVIEW";
  let oldMembershipMutation: Record<string, unknown> = {};
  let reviewResolution = "";
  const locked = () => assert.equal(calls[0], "lock");
  const tx = {
    groupMembership: {
      updateMany: async (query: { data: Record<string, unknown> }) => {
        locked(); oldMembershipMutation = query.data; membershipStatus = String(query.data.status);
        calls.push("legacy_membership"); return { count: 1 };
      },
      findUnique: async () => ({ groupId: "group-1", status: membershipStatus }),
    },
    adminReview: { update: async (query: { data: { resolution: string } }) => {
      locked(); reviewResolution = query.data.resolution; calls.push("legacy_review");
    } },
    workspace: { findUnique: async () => ({ id: "workspace-1" }) },
    workspaceMember: {
      upsert: async () => { locked(); calls.push("sync_membership_restored"); },
      updateMany: async () => { locked(); calls.push("sync_membership_left"); },
    },
  };
  const fixture = route(`src/app/api/admin/group-membership-reviews/[id]/${action}/route.ts`, {
    ...baseDependencies,
    "@/lib/auth": { requireRole: async (role: string) => { assert.equal(role, "ADMIN"); return { id: "admin-1" }; } },
    "@/lib/db": { db: {
      adminReview: { findUnique: async () => ({ id: "review-1", status: "pending", userId: "user-1" }) },
      $transaction: async (callback: (client: unknown) => Promise<unknown>) => callback(tx),
    } },
    "@/lib/audit": { logAudit: async () => {} },
    "@/lib/rating-profile-sync": { lockRatingUserTasks: async (_client: unknown, userId: string) => {
      assert.equal(userId, "user-1"); calls.push("lock");
    } },
    "@/server/bot/group-card-sync.service": { syncMembershipGroupCardsInTransaction: async (client: unknown, userId: string) => {
      assert.equal(client, tx); assert.equal(userId, "user-1"); locked(); calls.push("outbox");
    } },
  });
  return { ...fixture, calls, mutation: () => oldMembershipMutation, resolution: () => reviewResolution };
}

test("legacy admin restoration keeps its verification decision and atomically resumes card delivery", async () => {
  const fixture = legacyReviewFixture("restore");
  const response = await fixture.POST(request({}), context);
  assert.equal(response.status, 200);
  assert.equal(fixture.mutation().status, "VERIFIED");
  assert.equal(fixture.mutation().reviewedBy, "admin-1");
  assert.equal(fixture.resolution(), "restored");
  assert.deepEqual(fixture.calls, ["lock", "legacy_membership", "legacy_review", "sync_membership_restored", "outbox"]);
});

test("legacy admin leave confirmation keeps its old decision and atomically stops card delivery", async () => {
  const fixture = legacyReviewFixture("confirm-left");
  const response = await fixture.POST(request({}), context);
  assert.equal(response.status, 200);
  assert.equal(fixture.mutation().status, "LEFT_CONFIRMED");
  assert.equal(fixture.resolution(), "confirmed_left");
  assert.deepEqual(fixture.calls, ["lock", "legacy_membership", "legacy_review", "sync_membership_left", "outbox"]);
});
