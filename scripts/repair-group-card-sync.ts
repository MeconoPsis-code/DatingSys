import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Prisma } from "@prisma/client";
import { buildGroupCardForProfile } from "../src/lib/group-card";
import { groupCardSyncMode, type GroupCardSyncStatus } from "../src/lib/group-card-sync";
import { createGroupCardSyncCoordinator, decideGroupCardNickname } from "../src/server/bot/group-card-sync.coordinator";
import type { GroupCardCoordinatorDependencies, SyncObservation, SyncUserSnapshot } from "../src/server/bot/group-card-sync.types";

type Database = typeof import("../src/lib/db").db;
type Client = GroupCardCoordinatorDependencies["client"];
interface Options {
  userId?: string;
  workspaceId?: string;
  after?: string;
  output?: string;
  limit: number;
  apply: boolean;
  initialize: boolean;
}

const usage = `Usage: pnpm repair:group-card-sync -- [options]

Default: read-only DB / QQ inspection; prints a JSON difference report.
  --user <id>       Inspect one active linked user.
  --workspace <id>  Select users in this workspace; inspect all their groups.
  --limit <n>       Batch size, 1..1000 (default 100).
  --after <id>      Continue after a user ID from nextCursor.
  --output <path>   Save the JSON report locally.
  --apply           Queue durable work and process each selected user.
  --initialize      Label first baseline initialization (requires --apply).
  --help            Print this help without connecting to DB / QQ.

Apply requires GROUP_CARD_SYNC_MODE=active and respects GROUP_CARD_SYNC_USER_IDS.
An initialized user's existing baseline is never reset. A report is not an
apply input: apply always reads fresh QQ data and fences database revisions.
`;

function parseOptions(args: string[]): Options {
  const options: Options = { limit: 100, apply: false, initialize: false };
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === "--") continue;
    if (seen.has(flag)) throw new Error(`Duplicate argument: ${flag}`);
    seen.add(flag);
    if (flag === "--apply") { options.apply = true; continue; }
    if (flag === "--initialize") { options.initialize = true; continue; }
    if (!["--user", "--workspace", "--limit", "--after", "--output"].includes(flag)) throw new Error(`Unknown argument: ${flag}`);
    const value = args[++index];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
    if (flag === "--user") options.userId = value;
    if (flag === "--workspace") options.workspaceId = value;
    if (flag === "--after") options.after = value;
    if (flag === "--output") options.output = value;
    if (flag === "--limit") {
      if (!/^\d+$/u.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1 || Number(value) > 1000) {
        throw new Error("--limit must be an integer from 1 to 1000");
      }
      options.limit = Number(value);
    }
  }
  if (options.initialize && !options.apply) throw new Error("--initialize requires --apply");
  if (options.apply && groupCardSyncMode() !== "active") throw new Error("--apply requires GROUP_CARD_SYNC_MODE=active");
  return options;
}

const workspaceOperational = (workspace: { status: string; expiresAt: Date | null; botEnabled: boolean }, now: Date) =>
  workspace.status === "ACTIVE" && workspace.botEnabled && (!workspace.expiresAt || workspace.expiresAt > now);

/** A repeatable-read transaction is deliberately used without any queue helper. */
async function loadPreview(db: Database, userId: string, now: Date) {
  return db.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, include: {
      profile: { select: { birthDate: true, provinceCode: true } },
      authIdentities: { select: { provider: true, nickname: true }, orderBy: { createdAt: "asc" } },
      workspaceMembers: { where: { leftAt: null }, include: { workspace: true } },
    } });
    const [control, states, inbox, pendingAttempts, recentAttempts, setting] = await Promise.all([
      tx.userNicknameSync.findUnique({ where: { userId } }),
      tx.groupCardSyncState.findMany({ where: { userId } }),
      tx.groupCardSyncInbox.findMany({ where: { userId, status: "pending", OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] }, orderBy: { receivedAt: "asc" }, take: 200 }),
      tx.groupCardWriteAttempt.findMany({ where: { userId, status: { in: ["prepared", "sent", "unknown"] } }, orderBy: { startedAt: "desc" } }),
      tx.groupCardWriteAttempt.findMany({ where: { userId, startedAt: { gte: new Date(now.getTime() - 600_000) } }, orderBy: { startedAt: "desc" }, take: 200 }),
      tx.systemConfig.findUnique({ where: { key: "botOpen" } }),
    ]);
    const nickname = user.authIdentities.find((identity) => identity.provider === "qq_bot")?.nickname ?? user.authIdentities[0]?.nickname ?? "";
    const expectedCard = buildGroupCardForProfile(nickname, user.profile, now);
    const fingerprint = JSON.stringify([user.profile?.birthDate.toISOString().slice(0, 10) ?? null, user.profile?.provinceCode ?? null, expectedCard]);
    // --apply queues a forced target first; preview that same generation without
    // mutating the current control or manufacturing an initialized baseline.
    const cardRevision = (control?.cardRevision ?? 0) + (control?.profileFingerprint === fingerprint ? 0 : 1);
    const open = typeof setting?.value === "boolean" ? setting.value : true;
    const attempts = [...new Map([...pendingAttempts, ...recentAttempts].map((attempt) => [attempt.id, attempt])).values()];
    const snapshot: SyncUserSnapshot = {
      userId, qqNumber: user.qqNumber ?? "", nickname, sourceWorkspaceId: user.sourceWorkspaceId,
      nicknameRevision: control?.nicknameRevision ?? 0, nicknameChangedAt: control?.nicknameChangedAt ?? null,
      cardRevision, initializedAt: control?.initializedAt ?? null, inbox, attempts,
      groups: user.workspaceMembers.filter((member) => member.workspace.status !== "DELETED" && member.workspace.qqGroupId !== "default").map((member) => {
        const state = states.find((item) => item.groupId === member.workspace.qqGroupId);
        return {
          id: state?.id ?? `uninitialized:${member.workspace.qqGroupId}`, groupId: member.workspace.qqGroupId,
          workspaceId: member.workspaceId, workspaceName: member.workspace.name, workspaceSlug: member.workspace.slug,
          joinedAt: member.joinedAt, operational: open && workspaceOperational(member.workspace, now),
          desiredCard: expectedCard, desiredCardRevision: cardRevision, status: (state?.status ?? "pending") as GroupCardSyncStatus,
          observedCard: state?.observedCard ?? null, observedSeq: state?.observedSeq ?? 0, observedAt: state?.observedAt ?? null,
          resolvedObservedCard: state?.resolvedObservedCard ?? null, resolvedAt: state?.resolvedAt ?? null,
          resolvedObservationSeq: state?.resolvedObservationSeq ?? 0, confirmedCard: state?.confirmedCard ?? null,
          confirmedRevision: state?.confirmedRevision ?? null, syncedAt: state?.syncedAt ?? null,
          attemptCount: state?.attemptCount ?? 0, nextAttemptAt: state?.nextAttemptAt ?? null, lastErrorCode: state?.lastErrorCode ?? null,
        };
      }),
    };
    return { snapshot, expectedCard, profile: user.profile, states };
  }, { isolationLevel: "RepeatableRead" });
}

function serialClient(client: Client): Client {
  let nextStartAt = 0;
  let tail = Promise.resolve();
  function run<T>(call: () => Promise<T>): Promise<T> {
    const result = tail.then(async () => {
      const wait = nextStartAt - Date.now();
      if (wait > 0) await new Promise<void>((resolveWait) => setTimeout(resolveWait, wait));
      nextStartAt = Date.now() + 500;
      return call();
    });
    tail = result.then(() => {}, () => {});
    return result;
  }
  return {
    getStatus: (...args) => run(() => client.getStatus(...args)),
    getGroupMemberInfo: (...args) => run(() => client.getGroupMemberInfo(...args)),
    getGroupMemberList: (...args) => run(() => client.getGroupMemberList(...args)),
    setGroupCard: (...args) => run(() => client.setGroupCard(...args)),
  };
}

async function main() {
  if (process.argv.includes("--help")) { process.stdout.write(usage); return; }
  const options = parseOptions(process.argv.slice(2));
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  let database: Database | undefined;
  try {
    // Keep successful stdout machine-readable; application logging is not part
    // of the JSON report. Help / invalid-argument paths never load these modules.
    const { logger } = await import("../src/lib/logger");
    logger.level = "silent";
    database = (await import("../src/lib/db")).db;
    const db = database;
    try {
      await Promise.all([db.userNicknameSync.findFirst(), db.groupCardSyncState.findFirst(), db.groupCardSyncInbox.findFirst(), db.groupCardWriteAttempt.findFirst()]);
    } catch (cause) {
      const code = cause && typeof cause === "object" && "code" in cause ? cause.code : null;
      if (code === "P2021" || code === "P2022") throw new Error("Group card sync migration is missing; deploy migrations and regenerate Prisma before repair");
      throw cause;
    }
    const memberFilter: Prisma.WorkspaceMemberWhereInput = { leftAt: null, ...(options.workspaceId ? { workspaceId: options.workspaceId } : {}) };
    const users = await db.user.findMany({ where: {
      status: "ACTIVE", qqNumber: { not: null },
      ...(options.userId || options.after ? { id: { ...(options.userId ? { equals: options.userId } : {}), ...(options.after ? { gt: options.after } : {}) } } : {}),
      workspaceMembers: { some: memberFilter },
    }, orderBy: { id: "asc" }, take: options.limit + 1, select: { id: true } });
    const hasMore = users.length > options.limit;
    const selected = users.slice(0, options.limit);
    const allowlist = process.env.GROUP_CARD_SYNC_USER_IDS?.split(",").map((value) => value.trim()).filter(Boolean);
    if (options.apply && allowlist?.length) {
      const excluded = selected.filter((user) => !allowlist.includes(user.id)).map((user) => user.id);
      if (excluded.length) throw new Error(`Selected users are outside GROUP_CARD_SYNC_USER_IDS: ${excluded.join(", ")}`);
    }
    const { napcatClient } = await import("../src/server/bot/clients/napcat.client");
    const client = serialClient(napcatClient);
    const service = options.apply ? await import("../src/server/bot/group-card-sync.service") : null;
    let health: { online: boolean; good: boolean; error?: string };
    try { health = await client.getStatus({ retry: false }); }
    catch (cause) { health = { online: false, good: false, error: cause instanceof Error ? cause.message : String(cause) }; }
    let healthCheckedAt = Date.now();
    const records: unknown[] = [];
    let errors = 0;
    for (const user of selected) {
      try {
        if (Date.now() - healthCheckedAt >= 30_000) {
          try { health = await client.getStatus({ retry: false }); }
          catch (cause) { health = { online: false, good: false, error: cause instanceof Error ? cause.message : String(cause) }; }
          healthCheckedAt = Date.now();
        }
        const at = new Date();
        const preview = await loadPreview(db, user.id, at);
        const observations: SyncObservation[] = [];
        const readErrors = new Map<string, string>();
        for (const group of preview.snapshot.groups.filter((item) => item.operational)) {
          if (!health.online || !health.good) {
            readErrors.set(group.groupId, health.error ?? "QQ 当前离线，未把缓存名片作为实际值");
            continue;
          }
          try {
            const member = await client.getGroupMemberInfo(group.groupId, preview.snapshot.qqNumber, { noCache: true, retry: false });
            observations.push({ groupId: group.groupId, card: member.card, observedAt: new Date() });
          } catch (cause) { readErrors.set(group.groupId, cause instanceof Error ? cause.message : String(cause)); }
        }
        const decision = decideGroupCardNickname(preview.snapshot, observations);
        const proposedNickname = decision.nickname ?? preview.snapshot.nickname;
        const proposedCard = buildGroupCardForProfile(proposedNickname, preview.profile, new Date());
        const record: Record<string, unknown> = {
          userId: user.id, qqNumber: preview.snapshot.qqNumber, websiteNickname: preview.snapshot.nickname,
          expectedCard: preview.expectedCard, nicknameRevision: preview.snapshot.nicknameRevision,
          initializedAt: preview.snapshot.initializedAt, previewComplete: readErrors.size === 0,
          proposedNickname, proposedCard, proposedSource: decision.sourceGroupId ?? "website",
          initializationRequested: options.initialize,
          groups: preview.snapshot.groups.map((group) => {
            const observation = observations.find((item) => item.groupId === group.groupId);
            return { workspaceId: group.workspaceId, groupId: group.groupId, operational: group.operational,
              expectedCard: preview.expectedCard, actualCard: observation?.card ?? null,
              differs: observation ? observation.card !== preview.expectedCard : null,
              requiresQqWrite: observation ? observation.card !== proposedCard : null,
              proposedCard, outcome: decision.observations.find((item) => item.groupId === group.groupId)?.outcome ?? null,
              baseline: { resolvedCard: group.resolvedObservedCard, observationSeq: group.resolvedObservationSeq,
                confirmedCard: group.confirmedCard, confirmedRevision: group.confirmedRevision },
              storedDesiredCard: preview.states.find((item) => item.groupId === group.groupId)?.desiredCard ?? null,
              error: readErrors.get(group.groupId) ?? null };
          }),
        };
        if (service) {
          let claimed: boolean | null = null;
          // Never initialize/reset baseline here or feed the old report's winner
          // into the write. The coordinator fetches new values and fences them.
          await service.queueGroupCardSync(user.id, { force: true, source: "repair" });
          if (health.online && health.good) {
            const coordinator = createGroupCardSyncCoordinator({ repository: {
              ...service.groupCardSyncRepository,
              async claimLease(...args) {
                claimed = await service.groupCardSyncRepository.claimLease(...args);
                return claimed;
              },
            }, client, mode: () => "active" });
            await coordinator.processUser(user.id);
          }
          const final = await service.getGroupCardSyncView(user.id);
          record.execution = { queued: true, leaseAcquired: claimed,
            reason: !health.online || !health.good ? "queued_qq_offline" : claimed === false ? "queued_worker_busy" : "processed_read_latest_status",
            nickname: final.nickname, nicknameRevision: final.nicknameRevision,
            confirmed: final.groupCardSync.status === "synced", groupCardSync: final.groupCardSync };
        }
        records.push(record);
        if (readErrors.size) errors++;
      } catch (cause) {
        errors++;
        records.push({ userId: user.id, error: cause instanceof Error ? cause.message : String(cause) });
      }
    }
    const report = { mode: options.apply ? "apply" : "dry_run", generatedAt: new Date().toISOString(),
      filter: { userId: options.userId ?? null, workspaceId: options.workspaceId ?? null, after: options.after ?? null, limit: options.limit },
      qqHealth: health, scannedUsers: selected.length, errors, hasMore,
      nextCursor: hasMore ? selected.at(-1)?.id ?? null : null, records };
    const json = `${JSON.stringify(report, null, 2)}\n`;
    if (options.output) await writeFile(resolve(options.output), json, "utf8");
    process.stdout.write(json);
    if (errors) process.exitCode = 2;
  } finally { await database?.$disconnect(); }
}

main().catch((cause) => {
  process.stderr.write(`${JSON.stringify({ error: cause instanceof Error ? cause.message : String(cause) })}\n`);
  process.exitCode = 1;
});
