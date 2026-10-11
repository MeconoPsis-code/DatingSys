import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiHandler, parseJsonRequest } from "@/lib/api-handler";
import { AppError } from "@/lib/errors";
import { requireRole } from "@/lib/auth";
import { queueGroupCardSync, retryGroupCardSync } from "@/server/bot/group-card-sync.service";
import { aggregateGroupCardSyncStatus, groupCardSyncMode, groupCardSyncReason, type GroupCardSyncSummary } from "@/lib/group-card-sync";

function workspaceSummary(summary: GroupCardSyncSummary, workspaceId: string): GroupCardSyncSummary {
  const groups = summary.groups.filter((group) => group.workspaceId === workspaceId);
  const verified = groups.filter((group) => group.status !== "not_applicable").map((group) => group.lastVerifiedAt);
  return { ...summary, groups, status: aggregateGroupCardSyncStatus(groups),
    lastVerifiedAt: verified.length && verified.every(Boolean) ? verified.sort()[0] : null };
}

export const GET = apiHandler(async () => {
  await requireRole("ADMIN");
  const workspace = await db.workspace.findUnique({ where: { slug: "official" } });
  if (!workspace) throw new AppError("NOT_FOUND", "尚未配置官方群同步");
  const id = workspace.id;
  const mode = groupCardSyncMode();
  const rolloutUsers = process.env.GROUP_CARD_SYNC_USER_IDS?.split(",").map((value) => value.trim()).filter(Boolean);
  const monitoredUsers = mode === "active" && rolloutUsers?.length ? { userId: { in: rolloutUsers } } : {};
  const [states, pending, observed, blockedCount, failedCount, healthRecord, botSetting, successfulScan] = await Promise.all([
    db.groupCardSyncState.findMany({
      where: { workspaceId: id },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }], take: 200,
      include: { user: { select: {
        authIdentities: { select: { nickname: true }, orderBy: { createdAt: "asc" }, take: 1 },
      } } },
    }),
    db.groupCardSyncState.aggregate({
      where: { workspaceId: id, ...monitoredUsers, status: { in: ["pending", "syncing", "failed"] } },
      _count: true, _min: { pendingSince: true },
    }),
    db.groupCardSyncState.aggregate({ where: { workspaceId: id }, _max: { observedAt: true }, _min: { createdAt: true } }),
    db.groupCardSyncState.count({ where: { workspaceId: id, ...monitoredUsers, status: "paused", lastErrorCode: {
      in: ["permission_denied", "PERMISSION", "member_missing"],
    } } }),
    db.groupCardSyncState.count({ where: { workspaceId: id, ...monitoredUsers, status: "failed" } }),
    db.systemConfig.findUnique({ where: { key: "groupCardSyncHealth" } }),
    db.systemConfig.findUnique({ where: { key: "botOpen" } }),
    db.workspaceLog.findFirst({ where: { workspaceId: id, action: "GROUP_CARDS_RECONCILED" }, orderBy: { createdAt: "desc" } }),
  ]);
  const now = Date.now();
  const health = healthRecord?.value && typeof healthRecord.value === "object" && !Array.isArray(healthRecord.value)
    ? healthRecord.value as { online?: unknown; checkedAt?: unknown; error?: unknown } : null;
  const parsedCheckedAt = typeof health?.checkedAt === "string" ? new Date(health.checkedAt) : null;
  const checkedAt = parsedCheckedAt && Number.isFinite(parsedCheckedAt.getTime()) ? parsedCheckedAt : null;
  const fresh = checkedAt !== null && now - checkedAt.getTime() >= 0 && now - checkedAt.getTime() <= 90_000;
  const online = fresh && typeof health?.online === "boolean" ? health.online : null;
  const workspaceActive = workspace.status === "ACTIVE" && workspace.botEnabled && (!workspace.expiresAt || workspace.expiresAt.getTime() > now);
  const monitoringActive = mode === "active" && online === true && workspaceActive && botSetting?.value !== false;
  const oldestPendingAt = pending._min.pendingSince;
  const alerts: string[] = [];
  if (monitoringActive && oldestPendingAt && now - oldestPendingAt.getTime() > 10 * 60_000) {
    alerts.push("群名片同步积压已超过 10 分钟，请检查机器人登录状态及失败原因");
  }
  const scanReferenceAt = successfulScan?.createdAt ?? observed._min.createdAt;
  if (monitoringActive && scanReferenceAt && now - scanReferenceAt.getTime() > 20 * 60_000) {
    alerts.push("该工作空间超过 20 分钟没有成功的全量名片对账");
  }
  if (monitoringActive && failedCount > 0) alerts.push("存在同步失败的用户，可查看原因并重试");
  if (monitoringActive && blockedCount > 0) alerts.push("部分用户的群名片同步因权限或群成员状态暂停，需要管理员处理");
  return NextResponse.json({ data: {
    states: states.map((state) => {
      const effectiveStatus = state.status === "synced" &&
        (state.confirmedRevision !== state.desiredCardRevision || state.confirmedCard !== state.desiredCard || state.observedCard !== state.desiredCard)
        ? "pending" : state.status;
      const excludedFromRollout = mode === "active" && rolloutUsers?.length && !rolloutUsers.includes(state.userId) &&
        !["synced", "not_applicable"].includes(effectiveStatus);
      const modePaused = mode !== "active" && !["synced", "not_applicable"].includes(effectiveStatus);
      const workspacePaused = effectiveStatus !== "not_applicable" && !workspaceActive;
      const botPaused = effectiveStatus !== "not_applicable" && botSetting?.value === false;
      return {
      userId: state.userId, nickname: state.user.authIdentities[0]?.nickname ?? null,
      qqNumber: state.qqNumber, desiredCard: state.desiredCard,
      observedCard: state.observedCard, confirmedCard: state.confirmedCard,
      status: workspacePaused || botPaused || excludedFromRollout || modePaused ? "paused" : effectiveStatus,
      reason: workspacePaused ? "工作空间已暂停或到期" : botPaused ? "机器人同步暂时停用" :
        excludedFromRollout ? "该用户尚未启用灰度同步" : modePaused ? (mode === "observe" ? "当前仅观察群名片差异" : "群名片同步已停用") : groupCardSyncReason(state.lastErrorCode, state.lastError),
      errorCode: state.lastErrorCode, rawError: state.lastError,
      lastVerifiedAt: state.syncedAt?.toISOString() ?? null, updatedAt: state.updatedAt.toISOString(),
    }; }),
    metrics: {
      pendingCount: pending._count, oldestPendingAt: oldestPendingAt?.toISOString() ?? null,
      lastReconciledAt: successfulScan?.createdAt.toISOString() ?? null,
      lastObservedAt: observed._max.observedAt?.toISOString() ?? null,
      blockedCount, failedCount, mode, online, healthCheckedAt: checkedAt?.toISOString() ?? null, alerts,
    },
  } }, { headers: { "Cache-Control": "no-store" } });
});

export const POST = apiHandler(async (req) => {
  const actor = await requireRole("ADMIN");
  const workspace = await db.workspace.findUnique({ where: { slug: "official" } });
  if (!workspace) throw new AppError("NOT_FOUND", "尚未配置官方群同步");
  const id = workspace.id;
  const body = await parseJsonRequest<{ action?: unknown; userId?: unknown }>(req);
  if (body.action !== "retry" && body.action !== "reconcile") throw new AppError("VALIDATION_ERROR", "请选择对账或重试");
  if (body.userId !== undefined && (typeof body.userId !== "string" || !body.userId.trim())) throw new AppError("VALIDATION_ERROR", "用户标识无效");
  const userId = body.userId as string | undefined;
  if (userId && !(await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: id, userId } },
  }))) throw new AppError("FORBIDDEN", "该用户不在官方群工作空间");
  if (body.action === "retry") {
    if (userId) {
      return NextResponse.json({ data: {
        groupCardSync: workspaceSummary(await retryGroupCardSync(userId, id), id), queuedUsers: 1, failedUsers: [],
      } }, { status: 202 });
    }
    const unfinished = await db.groupCardSyncState.findMany({
      where: { workspaceId: id, status: { notIn: ["synced", "not_applicable"] }, user: {
        status: "ACTIVE", workspaceMembers: { some: { workspaceId: id, leftAt: null } },
      } },
      select: { userId: true },
    });
    let queuedUsers = 0;
    const failedUsers: Array<{ userId: string; error: string }> = [];
    for (const state of unfinished) {
      try {
        await retryGroupCardSync(state.userId, id);
        queuedUsers++;
      } catch (cause) {
        failedUsers.push({ userId: state.userId, error: cause instanceof Error ? cause.message : "重新同步失败" });
      }
    }
    return NextResponse.json({ data: { queuedUsers, failedUsers } }, { status: 202 });
  }
  const members = await db.workspaceMember.findMany({
    where: { workspaceId: id, leftAt: null, ...(userId ? { userId } : {}), user: { status: "ACTIVE" } },
    select: { userId: true },
  });
  for (const member of members) {
    await queueGroupCardSync(member.userId, { workspaceId: id, source: "admin_reconcile", force: true });
  }
  await db.workspaceLog.create({ data: {
    workspaceId: id, actorUserId: actor.id, action: "GROUP_CARD_RECONCILE_REQUESTED",
    metadata: { queuedUsers: members.length },
  } });
  return NextResponse.json({ data: { queuedUsers: members.length, message: "已安排后台群名片对账" } }, { status: 202 });
});
