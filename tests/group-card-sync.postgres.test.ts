/* eslint-disable @typescript-eslint/no-require-imports */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile, execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { promisify } from "node:util";
import { Pool } from "pg";
import { buildGroupCardForProfile } from "../src/lib/group-card";
import { createGroupCardSyncCoordinator, decideGroupCardNickname } from "../src/server/bot/group-card-sync.coordinator";
import type { GroupMemberInfo } from "../src/server/bot/bot.types";
import { lockRatingUserTasks } from "../src/lib/rating-profile-sync";

// This suite intentionally cannot fall back to DATABASE_URL or .env.local.
const suppliedURL = process.env.GROUP_CARD_TEST_DATABASE_URL;
const enabled = !!suppliedURL;
const url = enabled ? new URL(suppliedURL!) : null;
if (url) {
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname), "Tests require a loopback PostgreSQL instance");
  assert.match(url.pathname.slice(1), /^group_card_sync_test(?:_[a-z0-9]+)*$/i, "Use a disposable group_card_sync_test* database");
  process.env.DATABASE_URL = url.toString();
  process.env.GROUP_CARD_SYNC_MODE = "active";
  Object.assign(process.env, { NODE_ENV: "test" });
}
let service: typeof import("../src/server/bot/group-card-sync.service");
let db: typeof import("../src/lib/db").db;
let admin: Pool;
let createdDatabase = false;
let fixtureSequence = 0;

before(async () => {
  if (!url) return;
  const adminURL = new URL(url);
  adminURL.pathname = "/postgres";
  admin = new Pool({ connectionString: adminURL.toString() });
  const name = url.pathname.slice(1);
  const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
  assert.equal(exists.rowCount, 0, "The test database must not exist; existing data is never reset");
  await admin.query(`CREATE DATABASE "${name}"`);
  createdDatabase = true;
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const beforeSchema = schema.replace(/\n(?:\/\/\/[^\n]*\n)?model (?:UserNicknameSync|GroupCardSyncState|GroupCardSyncInbox|GroupCardWriteAttempt) \{[\s\S]*?\n\}/g, "")
    .replace(/^\s*(?:nicknameSync|groupCardSyncStates|groupCardSyncInbox|groupCardWriteAttempts)\s+.*\r?\n/gm, "");
  const directory = mkdtempSync(join(tmpdir(), "group-card-sync-db-test-"));
  const beforePath = join(directory, "before.prisma");
  const beforeSQL = join(directory, "before.sql");
  writeFileSync(beforePath, beforeSchema);
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "diff", "--from-empty", "--to-schema", beforePath, "--script", "--output", beforeSQL], { stdio: "pipe" });
  const setup = new Pool({ connectionString: url.toString() });
  await setup.query(readFileSync(beforeSQL, "utf8"));
  // Validate the real additive migration, not a db-push approximation.
  await setup.query(readFileSync("prisma/migrations/20261011000000_group_card_sync/migration.sql", "utf8"));
  await setup.end();
  // Supply an owned pool so $disconnect closes every test connection before
  // dropping the database. The application's externally supplied pool is shared.
  const { PrismaClient } = require("@prisma/client") as typeof import("@prisma/client");
  const { PrismaPg } = require("@prisma/adapter-pg") as typeof import("@prisma/adapter-pg");
  (globalThis as unknown as { prisma: typeof db }).prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: url.toString() }), { disposeExternalPool: true }) });
  ({ db } = require("../src/lib/db"));
  service = require("../src/server/bot/group-card-sync.service");
});
after(async () => {
  if (!url) return;
  await db?.$disconnect();
  if (createdDatabase) await admin.query(`DROP DATABASE "${url.pathname.slice(1)}"`);
  await admin?.end();
});

async function fixture(nickname = "Before", groups = 1) {
  const sequence = ++fixtureSequence;
  const workspaces = [];
  for (let i = 0; i < groups; i++) {
    workspaces.push(await db.workspace.create({ data: { slug: `card-test-${sequence}-${i}`, name: `Group ${i}`, qqGroupId: String(980000000 + sequence * 10 + i) } }));
  }
  const user = await db.user.create({ data: {
    qqNumber: String(880000000 + sequence), sourceWorkspaceId: workspaces[0].id,
    authIdentities: { create: [
      { provider: "qq_bot", providerUserId: String(sequence), openid: `card-test-${sequence}-a`, nickname },
      { provider: "qq_connect", providerUserId: String(sequence), openid: `card-test-${sequence}-b`, nickname },
    ] },
    profile: { create: { birthDate: new Date("2000-01-01T00:00:00Z"), heightCm: 170, weightKg: 60, provinceCode: "530000", cityCode: "530100", attribute: "ONE" } },
    workspaceMembers: { create: workspaces.map((workspace) => ({ workspaceId: workspace.id })) },
  }, include: { profile: true } });
  const card = buildGroupCardForProfile(nickname, user.profile);
  await service.queueGroupCardSync(user.id, { initialize: true, baselineGroupId: workspaces[0].qqGroupId, baselineCard: card });
  for (const workspace of workspaces) {
    await db.groupCardSyncState.update({ where: { userId_groupId: { userId: user.id, groupId: workspace.qqGroupId } }, data: { observedCard: card, resolvedObservedCard: card, observedSeq: 1, resolvedObservationSeq: 1 } });
  }
  const cards = new Map(workspaces.map((workspace) => [workspace.qqGroupId, card]));
  const writes: Array<{ groupId: string; card: string }> = [];
  const client = {
    async getStatus() { return { online: true, good: true }; },
    async getGroupMemberInfo(groupId: string, qqNumber: string) {
      return { groupId, qqNumber, card: cards.get(groupId) ?? "", nickname: "Personal QQ nickname", avatarUrl: "", role: "member" } as GroupMemberInfo;
    },
    async getGroupMemberList(groupId: string) { return [await client.getGroupMemberInfo(groupId, user.qqNumber!)]; },
    async setGroupCard(groupId: string, value: string, target: string) { void value; writes.push({ groupId, card: target }); cards.set(groupId, target); },
  };
  const coordinator = createGroupCardSyncCoordinator({ repository: service.groupCardSyncRepository, client, mode: () => "active" });
  const view = () => service.getGroupCardSyncView(user.id);
  return { user, workspaces, cards, writes, client, coordinator, view, card };
}
function dbTest(name: string, run: () => Promise<void>) { test(name, { skip: !enabled }, run); }

async function preparedReadbackFixture() {
  const f = await fixture();
  const now = new Date();
  const control = await db.userNicknameSync.findUniqueOrThrow({ where: { userId: f.user.id } });
  const token = `readback-race-${f.user.id}`;
  assert.equal(await service.groupCardSyncRepository.claimLease(f.user.id, token, now, new Date(now.getTime() + 120_000)), true);
  const attempt = await service.groupCardSyncRepository.prepareAttempt(f.user.id, token, f.workspaces[0].qqGroupId, control.cardRevision, f.card, now);
  assert.ok(attempt);
  const finish = () => service.groupCardSyncRepository.finishAttempt({
    userId: f.user.id, token, groupId: f.workspaces[0].qqGroupId,
    cardRevision: control.cardRevision, attemptId: attempt.id, status: "confirmed", observedCard: f.card, now: new Date(),
  });
  return { ...f, token, attempt, revision: control.cardRevision, finish };
}

dbTest("late readback cannot resurrect a departed group's synchronization state", async () => {
  const f = await preparedReadbackFixture();
  await db.$transaction(async (tx) => {
    await tx.workspaceMember.updateMany({ where: { userId: f.user.id }, data: { leftAt: new Date() } });
    await service.syncMembershipGroupCardsInTransaction(tx, f.user.id);
  });
  assert.equal((await db.userNicknameSync.findUniqueOrThrow({ where: { userId: f.user.id } })).cardRevision, f.revision);
  assert.equal(await f.finish(), false);
  const state = await db.groupCardSyncState.findUniqueOrThrow({ where: { userId_groupId: { userId: f.user.id, groupId: f.workspaces[0].qqGroupId } } });
  assert.equal(state.status, "not_applicable");
  assert.equal(state.confirmedCard, null);
  assert.equal((await db.groupCardWriteAttempt.findUniqueOrThrow({ where: { id: f.attempt.id } })).status, "superseded");
});

dbTest("late readback cannot overwrite a workspace pause without a new target revision", async () => {
  const f = await preparedReadbackFixture();
  await db.$transaction(async (tx) => {
    await tx.workspace.update({ where: { id: f.workspaces[0].id }, data: { botEnabled: false } });
    await service.syncMembershipGroupCardsInTransaction(tx, f.user.id);
  });
  assert.equal((await db.userNicknameSync.findUniqueOrThrow({ where: { userId: f.user.id } })).cardRevision, f.revision);
  assert.equal(await f.finish(), false);
  const state = await db.groupCardSyncState.findUniqueOrThrow({ where: { userId_groupId: { userId: f.user.id, groupId: f.workspaces[0].qqGroupId } } });
  assert.equal(state.status, "paused");
  assert.equal(state.confirmedCard, null);
});

dbTest("late readback checks actual botOpen even before its lifecycle hook has run", async () => {
  const f = await preparedReadbackFixture();
  const previous = await db.systemConfig.findUnique({ where: { key: "botOpen" } });
  const previousValue = typeof previous?.value === "boolean" ? previous.value : undefined;
  try {
    await db.systemConfig.upsert({ where: { key: "botOpen" }, create: { key: "botOpen", value: false }, update: { value: false } });
    const before = await db.groupCardSyncState.findUniqueOrThrow({ where: { userId_groupId: { userId: f.user.id, groupId: f.workspaces[0].qqGroupId } } });
    assert.equal(before.status, "syncing");
    assert.equal(await f.finish(), false);
    const after = await db.groupCardSyncState.findUniqueOrThrow({ where: { id: before.id } });
    assert.equal(after.status, before.status);
    assert.equal(after.confirmedCard, null);
  } finally {
    if (previousValue === undefined) await db.systemConfig.deleteMany({ where: { key: "botOpen" } });
    else await db.systemConfig.upsert({ where: { key: "botOpen" }, create: { key: "botOpen", value: previousValue }, update: { value: previousValue } });
  }
});

dbTest("new QQ inbox after readback prevents stale confirmation and later converges normally", async () => {
  const f = await preparedReadbackFixture();
  const groupId = f.workspaces[0].qqGroupId;
  const changedCard = "25-云南-FromQQ";
  f.cards.set(groupId, changedCard);
  await service.acceptGroupCardEvent({
    groupId, qqNumber: f.user.qqNumber!, cardOld: f.card, cardNew: changedCard,
    selfId: "robot", timestamp: Math.floor(Date.now() / 1000),
  }, f.workspaces[0].id);
  assert.equal((await db.userNicknameSync.findUniqueOrThrow({ where: { userId: f.user.id } })).cardRevision, f.revision);
  assert.equal(await f.finish(), false);
  const view = await f.view();
  assert.equal(view.groupCardSync.status, "pending");
  assert.equal(view.groupCardSync.groups[0].confirmedCard, null);
  assert.equal(await db.groupCardSyncInbox.count({ where: { userId: f.user.id, status: "pending" } }), 1);
  await service.groupCardSyncRepository.releaseLease(f.user.id, f.token, new Date());
  await f.coordinator.processUser(f.user.id);
  assert.equal((await f.view()).nickname, "FromQQ");
  assert.equal((await f.view()).groupCardSync.status, "synced");
});

dbTest("a departed nickname source cannot be accepted after its QQ batch was read", async () => {
  const f = await preparedReadbackFixture();
  const groupId = f.workspaces[0].qqGroupId;
  const card = "25-云南-FromQQ";
  await service.acceptGroupCardEvent({ groupId, qqNumber: f.user.qqNumber!, cardOld: f.card, cardNew: card }, f.workspaces[0].id);
  const snapshot = await service.groupCardSyncRepository.loadSnapshot(f.user.id, f.token, new Date());
  assert.ok(snapshot);
  const decision = decideGroupCardNickname(snapshot, [{ groupId, card, observedAt: new Date() }]);
  assert.equal(decision.nickname, "FromQQ");
  await db.$transaction(async (tx) => {
    await tx.workspaceMember.updateMany({ where: { userId: f.user.id }, data: { leftAt: new Date() } });
    await service.syncMembershipGroupCardsInTransaction(tx, f.user.id);
  });
  assert.equal((await db.userNicknameSync.findUniqueOrThrow({ where: { userId: f.user.id } })).cardRevision, f.revision);
  assert.equal(await service.groupCardSyncRepository.acceptDecision(f.user.id, f.token, f.revision, decision, new Date(), "active"), null);
  assert.equal((await f.view()).nickname, "Before");
  assert.equal(await db.groupCardSyncInbox.count({ where: { userId: f.user.id, status: "pending" } }), 0);
  assert.equal(await db.groupCardSyncInbox.count({ where: { userId: f.user.id, outcome: "inactive_group" } }), 1);
});

dbTest("a newly paused group's observation and inbox remain untouched when another source wins", async () => {
  const f = await fixture("Before", 2);
  const [source, paused] = f.workspaces;
  const sourceCard = "25-云南-FromQQ";
  const pausedCard = "99-云南-Before";
  for (const [workspace, card] of [[source, sourceCard], [paused, pausedCard]] as const) {
    await service.acceptGroupCardEvent({ groupId: workspace.qqGroupId, qqNumber: f.user.qqNumber!, cardOld: f.card, cardNew: card }, workspace.id);
  }
  const now = new Date();
  const token = `decision-race-${f.user.id}`;
  await service.groupCardSyncRepository.claimLease(f.user.id, token, now, new Date(now.getTime() + 120_000));
  const snapshot = await service.groupCardSyncRepository.loadSnapshot(f.user.id, token, now);
  assert.ok(snapshot);
  const decision = decideGroupCardNickname(snapshot, [
    { groupId: source.qqGroupId, card: sourceCard, observedAt: now },
    { groupId: paused.qqGroupId, card: pausedCard, observedAt: now },
  ]);
  await db.$transaction(async (tx) => {
    await tx.workspace.update({ where: { id: paused.id }, data: { botEnabled: false } });
    await service.syncMembershipGroupCardsInTransaction(tx, f.user.id);
  });
  assert.ok(await service.groupCardSyncRepository.acceptDecision(f.user.id, token, snapshot.cardRevision, decision, new Date(), "active"));
  assert.equal((await f.view()).nickname, "FromQQ");
  const pausedState = await db.groupCardSyncState.findUniqueOrThrow({ where: { userId_groupId: { userId: f.user.id, groupId: paused.qqGroupId } } });
  assert.equal(pausedState.status, "paused");
  assert.equal(pausedState.observedCard, f.card);
  assert.equal(await db.groupCardSyncInbox.count({ where: { userId: f.user.id, groupId: paused.qqGroupId, status: "pending" } }), 1);
  assert.equal(await db.groupCardSyncInbox.count({ where: { userId: f.user.id, groupId: source.qqGroupId, status: "pending" } }), 0);
});

dbTest("automatic identity repair respects the rollout allowlist while explicit website saves still work", async () => {
  const selected = await fixture();
  const excluded = await fixture();
  await db.authIdentity.updateMany({ where: { userId: excluded.user.id, provider: "qq_connect" }, data: { nickname: "Legacy different name" } });
  const previous = process.env.GROUP_CARD_SYNC_USER_IDS;
  process.env.GROUP_CARD_SYNC_USER_IDS = selected.user.id;
  try {
    await service.queueGroupCardSync(excluded.user.id, { source: "profile_refresh" });
    assert.equal((await db.authIdentity.findFirstOrThrow({ where: { userId: excluded.user.id, provider: "qq_connect" } })).nickname, "Legacy different name");
    await service.queueGroupCardSync(excluded.user.id, { nickname: "Explicit website name", source: "website_nickname" });
    const identities = await db.authIdentity.findMany({ where: { userId: excluded.user.id } });
    assert.ok(identities.every((identity) => identity.nickname === "Explicit website name"));
  } finally {
    if (previous === undefined) delete process.env.GROUP_CARD_SYNC_USER_IDS;
    else process.env.GROUP_CARD_SYNC_USER_IDS = previous;
  }
});

dbTest("departure retires old inbox before rejoin and a new QQ baseline cannot replay the old nickname", async () => {
  const f = await fixture();
  const workspace = f.workspaces[0];
  const oldCard = "25-云南-BeforeDeparture";
  f.cards.set(workspace.qqGroupId, oldCard);
  await service.acceptGroupCardEvent({
    groupId: workspace.qqGroupId, qqNumber: f.user.qqNumber!, cardOld: f.card, cardNew: oldCard,
  }, workspace.id);
  await db.$transaction(async (tx) => {
    await lockRatingUserTasks(tx, f.user.id);
    await tx.workspaceMember.updateMany({ where: { userId: f.user.id }, data: { leftAt: new Date() } });
    await service.syncMembershipGroupCardsInTransaction(tx, f.user.id);
  });
  assert.equal(await db.groupCardSyncInbox.count({ where: { userId: f.user.id, status: "pending" } }), 0);
  assert.equal(await db.groupCardSyncInbox.count({ where: { userId: f.user.id, status: "processed", outcome: "inactive_group" } }), 1);
  await service.queueGroupCardSync(f.user.id, { nickname: "WebsiteAfterLeave", source: "website_nickname" });
  const joinedAt = new Date();
  await db.$transaction(async (tx) => {
    await lockRatingUserTasks(tx, f.user.id);
    await tx.workspaceMember.updateMany({ where: { userId: f.user.id }, data: { leftAt: null, joinedAt } });
    await service.syncMembershipGroupCardsInTransaction(tx, f.user.id);
  });
  const pending = await db.groupCardSyncState.findUniqueOrThrow({ where: { userId_groupId: { userId: f.user.id, groupId: workspace.qqGroupId } } });
  assert.equal(pending.resolvedObservedCard, null);
  await f.coordinator.processUser(f.user.id);
  assert.equal((await f.view()).nickname, "WebsiteAfterLeave");
  assert.equal((await f.view()).groupCardSync.status, "synced");
  assert.ok(f.cards.get(workspace.qqGroupId)?.endsWith("-WebsiteAfterLeave"));
});

dbTest("an account without a valid nickname cannot prepare a write or manufacture a confirmation", async () => {
  const f = await fixture("");
  const now = new Date();
  const token = `missing-nickname-${f.user.id}`;
  const control = await db.userNicknameSync.findUniqueOrThrow({ where: { userId: f.user.id } });
  await service.groupCardSyncRepository.claimLease(f.user.id, token, now, new Date(now.getTime() + 120_000));
  assert.equal(await service.groupCardSyncRepository.prepareAttempt(f.user.id, token, f.workspaces[0].qqGroupId, control.cardRevision, "", now), null);
  assert.equal(await db.groupCardWriteAttempt.count({ where: { userId: f.user.id } }), 0);
  const state = await db.groupCardSyncState.findUniqueOrThrow({ where: { userId_groupId: { userId: f.user.id, groupId: f.workspaces[0].qqGroupId } } });
  assert.equal(state.status, "failed");
  assert.equal(state.confirmedCard, null);
});

dbTest("canonical nickname resembling a card prefix survives a same-value profile save", async () => {
  const f = await fixture("25-北京-");
  const before = await f.view();
  await db.$transaction(async (tx) => {
    await lockRatingUserTasks(tx, f.user.id);
    await tx.profile.update({ where: { userId: f.user.id }, data: { heightCm: 171 } });
    await service.queueGroupCardSyncInTransaction(tx, f.user.id, { nickname: "25-北京-", source: "website_profile" });
  });
  const after = await f.view();
  assert.equal(after.nickname, "25-北京-");
  assert.equal(after.nicknameRevision, before.nicknameRevision);
  assert.equal(after.groupCardSync.cardRevision, before.groupCardSync.cardRevision);
  assert.equal(after.groupCardSync.groups[0].desiredCard, before.groupCardSync.groups[0].desiredCard);
});

dbTest("same-province city edits create a new card version and confirm every group without renaming", async () => {
  const f = await fixture("25-北京-X", 2);
  await f.coordinator.processUser(f.user.id);
  const before = await f.view();
  assert.equal(before.groupCardSync.status, "synced");
  assert.match(before.groupCardSync.groups[0].desiredCard, /-云南\(昆明\)-25-北京-X$/);

  await db.$transaction(async (tx) => {
    await lockRatingUserTasks(tx, f.user.id);
    await tx.profile.update({ where: { userId: f.user.id }, data: { cityCode: "530300" } });
    await service.queueGroupCardSyncInTransaction(tx, f.user.id, { source: "website_profile" });
  });
  const queued = await f.view();
  assert.equal(queued.nickname, "25-北京-X");
  assert.equal(queued.nicknameRevision, before.nicknameRevision);
  assert.equal(queued.groupCardSync.cardRevision, before.groupCardSync.cardRevision + 1);
  assert.equal(queued.groupCardSync.status, "pending");
  assert.ok(queued.groupCardSync.groups.every((group) => /-云南\(曲靖\)-25-北京-X$/.test(group.desiredCard)));
  assert.ok(queued.groupCardSync.groups.every((group) => group.confirmedCard === f.card));

  await f.coordinator.processUser(f.user.id);
  const confirmed = await f.view();
  assert.equal(confirmed.nickname, "25-北京-X");
  assert.equal(confirmed.nicknameRevision, before.nicknameRevision);
  assert.equal(confirmed.groupCardSync.status, "synced");
  assert.ok(confirmed.groupCardSync.groups.every((group) => group.confirmedCard === group.desiredCard));
  assert.ok([...f.cards.values()].every((card) => /-云南\(曲靖\)-25-北京-X$/.test(card)));
  assert.ok((await db.authIdentity.findMany({ where: { userId: f.user.id } })).every((identity) => identity.nickname === "25-北京-X"));
});

dbTest("legacy province-only baselines upgrade to city cards without changing the nickname revision", async () => {
  const f = await fixture("Before", 2);
  const legacyCard = f.card.replace("云南(昆明)", "云南");
  const control = await db.userNicknameSync.findUniqueOrThrow({ where: { userId: f.user.id } });
  await db.userNicknameSync.update({ where: { userId: f.user.id }, data: {
    profileFingerprint: JSON.stringify(["2000-01-01", "530000", legacyCard]),
  } });
  await db.groupCardSyncState.updateMany({ where: { userId: f.user.id }, data: {
    desiredCard: legacyCard, observedCard: legacyCard, resolvedObservedCard: legacyCard,
    confirmedCard: legacyCard, confirmedRevision: control.cardRevision, status: "synced",
  } });
  for (const workspace of f.workspaces) f.cards.set(workspace.qqGroupId, legacyCard);

  await service.queueGroupCardSync(f.user.id, { source: "profile_refresh" });
  const queued = await f.view();
  assert.equal(queued.nickname, "Before");
  assert.equal(queued.nicknameRevision, control.nicknameRevision);
  assert.equal(queued.groupCardSync.cardRevision, control.cardRevision + 1);
  assert.ok(queued.groupCardSync.groups.every((group) => group.desiredCard === f.card));
  await f.coordinator.processUser(f.user.id);
  assert.equal((await f.view()).groupCardSync.status, "synced");
  assert.ok([...f.cards.values()].every((card) => card === f.card));
});

dbTest("QQ city-card rename accepts only the nickname and retains the website region across groups", async () => {
  const f = await fixture("Before", 2);
  const source = f.workspaces[0];
  const qqCard = "99-浙江(杭州)-FromQQ";
  f.cards.set(source.qqGroupId, qqCard);
  await service.acceptGroupCardEvent({
    groupId: source.qqGroupId, qqNumber: f.user.qqNumber!, cardOld: f.card, cardNew: qqCard,
    selfId: "robot", timestamp: Math.floor(Date.now() / 1000),
  }, source.id);
  await f.coordinator.processUser(f.user.id);
  const view = await f.view();
  assert.equal(view.nickname, "FromQQ");
  assert.equal(view.groupCardSync.status, "synced");
  assert.ok([...f.cards.values()].every((card) => /-云南\(昆明\)-FromQQ$/.test(card)));
  assert.ok(view.groupCardSync.groups.every((group) => group.confirmedCard === group.desiredCard));
});

dbTest("birth date changes that keep the current age only refresh the fingerprint", async () => {
  const f = await fixture();
  const before = await db.userNicknameSync.findUniqueOrThrow({ where: { userId: f.user.id } });
  // Move only the day, choosing another already-passed date in the same birth
  // year. Jan 1 / Jan 2 share today's age except exactly Jan 1.
  const shanghai = new Date(Date.now() + 8 * 60 * 60_000);
  const nextBirthDate = shanghai.getUTCMonth() === 0 && shanghai.getUTCDate() === 1
    ? new Date("1999-12-31T00:00:00Z") : new Date("2000-01-02T00:00:00Z");
  await db.$transaction(async (tx) => {
    await lockRatingUserTasks(tx, f.user.id);
    await tx.profile.update({ where: { userId: f.user.id }, data: { birthDate: nextBirthDate } });
    await service.queueGroupCardSyncInTransaction(tx, f.user.id, { source: "website_profile" });
  });
  const after = await db.userNicknameSync.findUniqueOrThrow({ where: { userId: f.user.id } });
  assert.equal(after.nicknameRevision, before.nicknameRevision);
  assert.equal(after.cardRevision, before.cardRevision);
  assert.notEqual(after.profileFingerprint, before.profileFingerprint);
  assert.equal((await f.view()).groupCardSync.groups[0].desiredCard, f.card);
});

dbTest("clearing the live profile queues nickname-only targets in the same transaction", async () => {
  const f = await fixture();
  const before = await f.view();
  await db.$transaction(async (tx) => {
    await lockRatingUserTasks(tx, f.user.id);
    await tx.profile.delete({ where: { userId: f.user.id } });
    await service.queueGroupCardSyncInTransaction(tx, f.user.id, { source: "website_profile_clear" });
  });
  const after = await f.view();
  assert.equal(after.nickname, "Before");
  assert.equal(after.nicknameRevision, before.nicknameRevision);
  assert.equal(after.groupCardSync.cardRevision, before.groupCardSync.cardRevision + 1);
  assert.equal(after.groupCardSync.groups[0].desiredCard, "Before");
});

dbTest("migration creates foreign keys and pending-only indexes", async () => {
  const rows = await db.$queryRaw<Array<{ indexname: string }>>`SELECT indexname FROM pg_indexes WHERE indexname LIKE 'group_card%due_idx'`;
  assert.equal(rows.length, 2);
  await assert.rejects(db.groupCardSyncState.create({ data: { userId: "absent", workspaceId: "absent", qqNumber: "1", groupId: "1", desiredCard: "X" } }));
});
dbTest("website nickname and outbox roll back together on transaction failure", async () => {
  const f = await fixture();
  const beforeView = await f.view();
  await assert.rejects(db.$transaction(async (tx) => {
    await service.queueGroupCardSyncInTransaction(tx, f.user.id, { nickname: "After" });
    throw new Error("simulated failure after outbox write");
  }));
  assert.deepEqual(await f.view(), beforeView);
});
dbTest("profile and outbox roll back together and drafts never supply age/province", async () => {
  const f = await fixture();
  await assert.rejects(db.$transaction(async (tx) => {
    await tx.profile.update({ where: { userId: f.user.id }, data: { provinceCode: "110000" } });
    await service.queueGroupCardSyncInTransaction(tx, f.user.id);
    throw new Error("simulate outbox transaction failure");
  }));
  assert.equal((await db.profile.findUniqueOrThrow({ where: { userId: f.user.id } })).provinceCode, "530000");
  const control = await db.userNicknameSync.findUniqueOrThrow({ where: { userId: f.user.id } });
  await db.profile.update({ where: { userId: f.user.id }, data: { draftData: { profile: { provinceCode: "110000", birthDate: "1980-01-01" } } } });
  await service.queueGroupCardSync(f.user.id);
  assert.equal((await f.view()).groupCardSync.groups[0].desiredCard, f.card);
  assert.equal((await db.userNicknameSync.findUniqueOrThrow({ where: { userId: f.user.id } })).cardRevision, control.cardRevision);
});
dbTest("all identities update atomically; website change converges after app restart", async () => {
  const f = await fixture("Before", 2);
  await service.queueGroupCardSync(f.user.id, { nickname: "After" });
  assert.equal((await f.view()).groupCardSync.status, "pending");
  const restarted = createGroupCardSyncCoordinator({ repository: service.groupCardSyncRepository, client: f.client, mode: () => "active" });
  await restarted.processUser(f.user.id);
  assert.equal((await f.view()).groupCardSync.status, "synced");
  const identities = await db.authIdentity.findMany({ where: { userId: f.user.id } });
  assert.deepEqual(identities.map((identity) => identity.nickname), ["After", "After"]);
  assert.ok([...f.cards.values()].every((card) => card.endsWith("-After")));
});
dbTest("same nickname retries preserve revision and nickname-looking suffixes", async () => {
  const f = await fixture("25-北京-X");
  const initial = await f.view();
  await service.queueGroupCardSync(f.user.id, { nickname: "25-北京-X", force: true });
  const view = await f.view();
  assert.equal(view.nickname, "25-北京-X");
  assert.equal(view.nicknameRevision, initial.nicknameRevision);
  assert.equal(view.groupCardSync.groups[0].desiredCard, f.card);
});
dbTest("stale revision conflicts preserve nickname and outbox", async () => {
  const f = await fixture();
  await service.queueGroupCardSync(f.user.id, { nickname: "Newest" });
  const beforeView = await f.view();
  await assert.rejects(service.queueGroupCardSync(f.user.id, { nickname: "Stale", baseNicknameRevision: 0 }), service.NicknameRevisionConflictError);
  assert.deepEqual(await f.view(), beforeView);
});
dbTest("durable webhook uniqueness distinguishes robot identity and card transitions", async () => {
  const f = await fixture();
  const event = { qqNumber: f.user.qqNumber!, groupId: f.workspaces[0].qqGroupId, selfId: "robot1", timestamp: Math.floor(Date.now() / 1000), cardOld: f.card, cardNew: "Changed" };
  const results = await Promise.all([service.acceptGroupCardEvent(event, f.workspaces[0].id), service.acceptGroupCardEvent(event, f.workspaces[0].id)]);
  assert.deepEqual(results.map((result) => result.duplicate).sort(), [false, true]);
  await service.acceptGroupCardEvent({ ...event, selfId: "robot2" }, f.workspaces[0].id);
  await service.acceptGroupCardEvent({ ...event, cardOld: "Other old value" }, f.workspaces[0].id);
  assert.equal(await db.groupCardSyncInbox.count({ where: { userId: f.user.id } }), 3);
});
dbTest("QQ rename preserves website age/province and updates every group", async () => {
  const f = await fixture("Before", 2);
  f.cards.set(f.workspaces[0].qqGroupId, "99/不存在/FromQQ");
  await f.coordinator.processUser(f.user.id);
  const view = await f.view();
  assert.equal(view.nickname, "FromQQ");
  assert.equal(view.groupCardSync.status, "synced");
  assert.ok([...f.cards.values()].every((card) => card === buildGroupCardForProfile("FromQQ", f.user.profile)));
});
dbTest("multi-group losing observation is consumed even when its propagation fails", async () => {
  const f = await fixture("Before", 2);
  f.cards.set(f.workspaces[0].qqGroupId, buildGroupCardForProfile("Winner", f.user.profile));
  f.cards.set(f.workspaces[1].qqGroupId, buildGroupCardForProfile("Loser", f.user.profile));
  f.client.setGroupCard = async () => { throw new Error("no permission"); };
  await f.coordinator.processUser(f.user.id);
  assert.equal((await f.view()).nickname, "Winner");
  const loser = await db.groupCardSyncState.findUniqueOrThrow({ where: { userId_groupId: { userId: f.user.id, groupId: f.workspaces[1].qqGroupId } } });
  assert.equal(loser.resolvedObservedCard, f.cards.get(f.workspaces[1].qqGroupId));
  await f.coordinator.processUser(f.user.id);
  assert.equal((await f.view()).nickname, "Winner");
  assert.equal((await f.view()).groupCardSync.status, "partial");
});
dbTest("cleared card restores the last valid nickname without clearing website", async () => {
  const f = await fixture();
  f.cards.set(f.workspaces[0].qqGroupId, "");
  await f.coordinator.processUser(f.user.id);
  assert.equal((await f.view()).nickname, "Before");
  assert.equal(f.cards.get(f.workspaces[0].qqGroupId), f.card);
});
dbTest("an expired worker cannot confirm a newer website revision", async () => {
  const f = await fixture();
  const now = new Date();
  assert.equal(await service.groupCardSyncRepository.claimLease(f.user.id, "old-token", now, new Date(now.getTime() + 120000)), true);
  const control = await db.userNicknameSync.findUniqueOrThrow({ where: { userId: f.user.id } });
  const attempt = await service.groupCardSyncRepository.prepareAttempt(f.user.id, "old-token", f.workspaces[0].qqGroupId, control.cardRevision, f.card, now);
  await service.queueGroupCardSync(f.user.id, { nickname: "Newer" });
  assert.equal(await service.groupCardSyncRepository.finishAttempt({ userId: f.user.id, token: "old-token", groupId: f.workspaces[0].qqGroupId, cardRevision: control.cardRevision, attemptId: attempt!.id, status: "confirmed", observedCard: f.card, now: new Date() }), false);
  assert.equal((await f.view()).groupCardSync.status, "pending");
  assert.equal((await db.groupCardWriteAttempt.findUniqueOrThrow({ where: { id: attempt!.id } })).status, "superseded");
  await service.groupCardSyncRepository.releaseLease(f.user.id, "old-token", new Date());
});
dbTest("database lease admits one worker and an obsolete token cannot clear its successor", async () => {
  const f = await fixture();
  const now = new Date();
  const results = await Promise.all(["a", "b"].map((token) => service.groupCardSyncRepository.claimLease(f.user.id, token, now, new Date(now.getTime() + 120000))));
  assert.equal(results.filter(Boolean).length, 1);
  const owner = results[0] ? "a" : "b";
  const expiredAt = new Date(now.getTime() + 120001);
  assert.equal(await service.groupCardSyncRepository.claimLease(f.user.id, "successor", expiredAt, new Date(expiredAt.getTime() + 120000)), true);
  await service.groupCardSyncRepository.releaseLease(f.user.id, owner, expiredAt);
  assert.equal((await db.userNicknameSync.findUniqueOrThrow({ where: { userId: f.user.id } })).leaseToken, "successor");
});
dbTest("permission pause does not hot-loop inbox and manual retry re-enables it", async () => {
  const f = await fixture();
  const now = new Date();
  await service.acceptGroupCardEvent({ groupId: f.workspaces[0].qqGroupId, qqNumber: f.user.qqNumber!, cardNew: "Changed", cardOld: f.card, selfId: "robot", timestamp: Math.floor(now.getTime() / 1000) }, f.workspaces[0].id);
  await service.groupCardSyncRepository.claimLease(f.user.id, "token", now, new Date(now.getTime() + 120000));
  const snapshot = await service.groupCardSyncRepository.loadSnapshot(f.user.id, "token", now);
  await service.groupCardSyncRepository.failGroup(f.user.id, "token", f.workspaces[0].qqGroupId, snapshot!.cardRevision, "permission_denied", "权限不足", new Date(now.getTime() + 5000), now);
  await service.groupCardSyncRepository.releaseLease(f.user.id, "token", now);
  assert.equal((await db.userNicknameSync.findUniqueOrThrow({ where: { userId: f.user.id } })).nextWorkAt, null);
  await service.retryGroupCardSync(f.user.id);
  assert.equal((await f.view()).groupCardSync.status, "pending");
  await assert.rejects(service.retryGroupCardSync(f.user.id), /30 秒/);
});
dbTest("departure suppresses remote writes and membership rejoin rebuilds targets", async () => {
  const f = await fixture();
  await db.$transaction(async (tx) => {
    await tx.workspaceMember.updateMany({ where: { userId: f.user.id }, data: { leftAt: new Date() } });
    await service.syncMembershipGroupCardsInTransaction(tx, f.user.id);
  });
  await f.coordinator.processUser(f.user.id);
  assert.equal(f.writes.length, 0);
  assert.equal((await f.view()).groupCardSync.status, "not_applicable");
  await db.$transaction(async (tx) => {
    await tx.workspaceMember.updateMany({ where: { userId: f.user.id }, data: { leftAt: null } });
    await service.syncMembershipGroupCardsInTransaction(tx, f.user.id);
  });
  assert.equal((await f.view()).groupCardSync.status, "pending");
});
dbTest("workspace pause and resume keep desired work without freezing it forever", async () => {
  const f = await fixture();
  await db.workspace.update({ where: { id: f.workspaces[0].id }, data: { botEnabled: false } });
  await service.queueGroupCardSync(f.user.id);
  assert.equal((await f.view()).groupCardSync.status, "paused");
  await db.workspace.update({ where: { id: f.workspaces[0].id }, data: { botEnabled: true } });
  await service.queueGroupCardSync(f.user.id);
  assert.equal((await f.view()).groupCardSync.status, "pending");
  await f.coordinator.processUser(f.user.id);
  assert.equal((await f.view()).groupCardSync.status, "synced");
  // Natural expiry has no mutation hook; the read model must still pause immediately.
  await db.workspace.update({ where: { id: f.workspaces[0].id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await f.view()).groupCardSync.status, "paused");
});
dbTest("observe does not rename users or consume their accepted inbox", async () => {
  const f = await fixture();
  await f.coordinator.processUser(f.user.id);
  const baseline = await db.groupCardSyncState.findUniqueOrThrow({ where: { userId_groupId: { userId: f.user.id, groupId: f.workspaces[0].qqGroupId } } });
  assert.equal(baseline.status, "synced");
  f.cards.set(f.workspaces[0].qqGroupId, "FromQQ");
  const previousMode = process.env.GROUP_CARD_SYNC_MODE;
  process.env.GROUP_CARD_SYNC_MODE = "observe";
  try {
  await service.groupCardSyncRepository.scheduleReconciliation(f.workspaces[0].id, [{ qqNumber: f.user.qqNumber!, card: "FromQQ" }], new Date());
  const drift = await db.groupCardSyncState.findUniqueOrThrow({ where: { id: baseline.id } });
  assert.equal(drift.status, "synced"); // Historical confirmation remains evidence, not current success.
  assert.equal(drift.observedCard, "FromQQ");
  assert.equal(drift.resolvedObservedCard, baseline.resolvedObservedCard);
  assert.equal((await f.view()).groupCardSync.status, "paused");
  await service.acceptGroupCardEvent({ groupId: f.workspaces[0].qqGroupId, qqNumber: f.user.qqNumber!, cardOld: f.card, cardNew: "FromQQ" }, f.workspaces[0].id);
  const coordinator = createGroupCardSyncCoordinator({ repository: service.groupCardSyncRepository, client: f.client, mode: () => "observe" });
  await coordinator.processUser(f.user.id);
  assert.equal((await f.view()).nickname, "Before");
  assert.equal(f.writes.length, 0);
  assert.equal(await db.groupCardSyncInbox.count({ where: { userId: f.user.id, status: "pending" } }), 1);
  } finally {
    if (previousMode === undefined) delete process.env.GROUP_CARD_SYNC_MODE;
    else process.env.GROUP_CARD_SYNC_MODE = previousMode;
  }
});
dbTest("rollout allowlist excludes non-selected users", async () => {
  const a = await fixture();
  const b = await fixture();
  process.env.GROUP_CARD_SYNC_USER_IDS = a.user.id;
  try {
    const due = await service.groupCardSyncRepository.listDueUsers(new Date(Date.now() + 1000), 100);
    assert.ok(due.includes(a.user.id));
    assert.ok(!due.includes(b.user.id));
    assert.equal((await b.view()).groupCardSync.status, "paused");
  } finally { delete process.env.GROUP_CARD_SYNC_USER_IDS; }
});

dbTest("prepared write survives long downtime, then closes without blacklisting future manual names", async () => {
  const f = await fixture();
  const old = new Date(Date.now() - 3600000);
  const control = await db.userNicknameSync.findUniqueOrThrow({ where: { userId: f.user.id } });
  const unknown = await db.groupCardWriteAttempt.create({ data: {
    userId: f.user.id, groupId: f.workspaces[0].qqGroupId, qqNumber: f.user.qqNumber!,
    nicknameRevision: control.nicknameRevision, cardRevision: control.cardRevision, targetCard: f.card,
    fromObservedCard: "Earlier", baselineObservationSeq: 1, leaseToken: "crashed-worker", startedAt: old,
  } });
  await service.queueGroupCardSync(f.user.id, { nickname: "Newer" });
  await f.coordinator.processUser(f.user.id);
  assert.equal((await f.view()).nickname, "Newer");
  assert.equal((await db.groupCardWriteAttempt.findUniqueOrThrow({ where: { id: unknown.id } })).status, "reconciled");
  const before = f.cards.get(f.workspaces[0].qqGroupId)!;
  f.cards.set(f.workspaces[0].qqGroupId, f.card);
  await service.acceptGroupCardEvent({ groupId: f.workspaces[0].qqGroupId, qqNumber: f.user.qqNumber!, cardOld: before, cardNew: f.card, timestamp: Math.floor(Date.now() / 1000) }, f.workspaces[0].id);
  await f.coordinator.processUser(f.user.id);
  assert.equal((await f.view()).nickname, "Before");
});

dbTest("observe-mode birthday scan leaves website identities unchanged", async () => {
  const f = await fixture();
  await db.authIdentity.updateMany({ where: { userId: f.user.id, provider: "qq_connect" }, data: { nickname: "Different legacy identity" } });
  process.env.GROUP_CARD_SYNC_MODE = "observe";
  try {
    await service.queueGroupCardSync(f.user.id, { source: "profile_refresh" });
    assert.equal((await db.authIdentity.findFirstOrThrow({ where: { userId: f.user.id, provider: "qq_connect" } })).nickname, "Different legacy identity");
    assert.equal((await f.view()).groupCardSync.status, "paused");
  } finally { process.env.GROUP_CARD_SYNC_MODE = "active"; }
});

dbTest("repair default dry run queries fresh QQ but never writes website, states or QQ", async () => {
  const f = await fixture();
  const capture = async () => ({
    identities: await db.authIdentity.findMany({ where: { userId: f.user.id } }),
    control: await db.userNicknameSync.findUnique({ where: { userId: f.user.id } }),
    states: await db.groupCardSyncState.findMany({ where: { userId: f.user.id } }),
    inboxCount: await db.groupCardSyncInbox.count(), attemptCount: await db.groupCardWriteAttempt.count(),
  });
  const initial = await capture();
  let remoteWrites = 0;
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const params = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/get_status") response.end(JSON.stringify({ status: "ok", retcode: 0, data: { online: true, good: true } }));
    else if (request.url === "/get_group_member_info") response.end(JSON.stringify({ status: "ok", retcode: 0, data: { group_id: params.group_id, user_id: params.user_id, card: "29/北京/DryQQ", nickname: "PersonalQQ", role: "member" } }));
    else { remoteWrites++; response.end(JSON.stringify({ status: "failed", retcode: 1, message: "No writes allowed" })); }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    const result = await promisify(execFile)(process.execPath, ["node_modules/ts-node/dist/bin.js", "--project", "tsconfig.test.json", "-r", "./scripts/register-path-alias.cjs", "scripts/repair-group-card-sync.ts", "--user", f.user.id], {
      env: { ...process.env, DATABASE_URL: url!.toString(), GROUP_CARD_SYNC_MODE: "observe", NAPCAT_HTTP_BASE_URL: `http://127.0.0.1:${address.port}`, NAPCAT_ACCESS_TOKEN: "isolated-test-token" }, timeout: 60000,
    });
    const report = JSON.parse(result.stdout);
    assert.ok(JSON.stringify(report).includes("DryQQ"));
    assert.deepEqual(await capture(), initial);
    assert.equal(remoteWrites, 0);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

dbTest("legacy unlinked BotIdentity mirrors nickname and only its own confirmed group card", async () => {
  const f = await fixture("Before", 2);
  const identityGroupId = f.workspaces[1].qqGroupId;
  const identity = await db.botIdentity.create({ data: {
    qqNumber: f.user.qqNumber!, qqEmail: `${f.user.qqNumber}@qq.com`,
    groupId: identityGroupId, registeredFromGroupId: identityGroupId,
    qqNickname: "Before", groupCard: f.card, groupCardSyncStatus: "pending_sync",
  } });
  const readIdentity = () => db.botIdentity.findUniqueOrThrow({ where: { id: identity.id } });
  await service.queueGroupCardSync(f.user.id, { nickname: "After" });
  assert.equal((await readIdentity()).userId, null, "compatibility does not relink legacy identities");
  assert.equal((await readIdentity()).qqNickname, "After");
  assert.equal((await readIdentity()).groupCard, f.card, "website save cannot claim QQ writeback");
  assert.equal((await readIdentity()).groupCardSyncedAt, null);
  const now = new Date();
  const token = `legacy-mirror-${f.user.id}`;
  assert.equal(await service.groupCardSyncRepository.claimLease(f.user.id, token, now, new Date(now.getTime() + 120_000)), true);
  const finish = async (groupId: string, observedCard?: string) => {
    const state = await db.groupCardSyncState.findUniqueOrThrow({ where: { userId_groupId: { userId: f.user.id, groupId } } });
    const attempt = await service.groupCardSyncRepository.prepareAttempt(f.user.id, token, groupId, state.desiredCardRevision, f.card, new Date());
    assert.ok(attempt);
    return service.groupCardSyncRepository.finishAttempt({
      userId: f.user.id, token, groupId, cardRevision: state.desiredCardRevision,
      attemptId: attempt.id, status: "confirmed", observedCard: observedCard ?? state.desiredCard, now: new Date(),
    });
  };
  assert.equal(await finish(f.workspaces[0].qqGroupId), true);
  assert.equal((await readIdentity()).groupCard, f.card, "another group's confirmation is not this identity's card");
  assert.equal((await readIdentity()).groupCardSyncStatus, "pending_sync");
  assert.equal((await readIdentity()).groupCardSyncedAt, null);
  assert.equal(await finish(identityGroupId, f.card), false);
  assert.equal((await readIdentity()).groupCard, f.card, "mismatched readback is not a confirmation");
  assert.equal((await readIdentity()).groupCardSyncedAt, null);
  assert.equal(await finish(identityGroupId), true);
  const confirmed = await readIdentity();
  assert.equal(confirmed.groupCard, buildGroupCardForProfile("After", f.user.profile));
  assert.equal(confirmed.groupCardSyncStatus, "synced");
  assert.ok(confirmed.groupCardSyncedAt);

  const anotherUser = await db.user.create({ data: {} });
  await db.botIdentity.update({ where: { id: identity.id }, data: { userId: anotherUser.id } });
  await service.queueGroupCardSync(f.user.id, { nickname: "Newest" });
  assert.equal((await readIdentity()).qqNickname, "After", "matching QQ cannot override an identity bound to another user");
  assert.equal(await finish(identityGroupId), true);
  assert.equal((await readIdentity()).groupCard, confirmed.groupCard);
  assert.equal((await readIdentity()).groupCardSyncedAt?.getTime(), confirmed.groupCardSyncedAt?.getTime());
  await service.groupCardSyncRepository.releaseLease(f.user.id, token, new Date());
});

dbTest("paused historical user initializes only after a fresh live group observation", async () => {
  const f = await fixture("WebsiteBefore", 2);
  await db.userNicknameSync.update({ where: { userId: f.user.id }, data: { initializedAt: null } });
  await db.groupCardSyncState.updateMany({ where: { userId: f.user.id }, data: {
    resolvedObservedCard: null, resolvedObservationSeq: 0, resolvedAt: null,
  } });
  await db.workspace.updateMany({ where: { id: { in: f.workspaces.map((workspace) => workspace.id) } }, data: { status: "PAUSED" } });
  let reads = 0;
  const originalRead = f.client.getGroupMemberInfo;
  f.client.getGroupMemberInfo = async (...args) => { reads++; return originalRead(...args); };
  await service.queueGroupCardSync(f.user.id, { source: "profile_refresh" });
  await f.coordinator.processUser(f.user.id);
  assert.equal(reads, 0, "a paused batch cannot supply a fresh QQ observation");
  assert.equal((await db.userNicknameSync.findUniqueOrThrow({ where: { userId: f.user.id } })).initializedAt, null);
  assert.equal((await f.view()).nickname, "WebsiteBefore");
  assert.ok((await db.groupCardSyncState.findMany({ where: { userId: f.user.id } })).every((state) => state.resolvedObservedCard === null));

  await db.workspace.update({ where: { id: f.workspaces[0].id }, data: { status: "ACTIVE" } });
  f.cards.set(f.workspaces[0].qqGroupId, "27/云南/FirstQQ");
  await service.queueGroupCardSync(f.user.id, { source: "profile_refresh" });
  await f.coordinator.processUser(f.user.id);
  assert.ok(reads > 0);
  assert.equal((await f.view()).nickname, "FirstQQ", "first accessible QQ value must retain historical initialization priority");
  assert.ok((await db.userNicknameSync.findUniqueOrThrow({ where: { userId: f.user.id } })).initializedAt);
  assert.equal(f.cards.get(f.workspaces[0].qqGroupId), buildGroupCardForProfile("FirstQQ", f.user.profile));
  const paused = await db.groupCardSyncState.findUniqueOrThrow({ where: { userId_groupId: { userId: f.user.id, groupId: f.workspaces[1].qqGroupId } } });
  assert.equal(paused.status, "paused");
  assert.equal(paused.resolvedObservedCard, null, "a healthy group's observation does not manufacture the paused group's baseline");
});
