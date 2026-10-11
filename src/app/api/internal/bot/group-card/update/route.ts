import { NextResponse } from "next/server";
import { BOT_CONFIG } from "@/server/bot/bot.config";
import { db } from "@/lib/db";
import { apiHandler, parseJsonRequest } from "@/lib/api-handler";
import { AppError } from "@/lib/errors";
import { getGroupCardSyncSummary, queueGroupCardSyncInTransaction } from "@/server/bot/group-card-sync.service";
import { logBotAudit, BOT_AUDIT_ACTIONS } from "@/server/bot/bot-audit.service";

/** Internal compatibility endpoint. All writes enter the durable coordinator. */
export const POST = apiHandler(async (req) => {
  const secret = req.headers.get("x-internal-secret");
  if (!secret || secret !== BOT_CONFIG.internalSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await parseJsonRequest<{ groupId?: unknown; qqNumber?: unknown; targetCard?: unknown }>(req);
  if (typeof body.groupId !== "string" || typeof body.qqNumber !== "string" || typeof body.targetCard !== "string") {
    throw new AppError("VALIDATION_ERROR", "groupId、qqNumber、targetCard 必须为字符串");
  }
  const { groupId, qqNumber, targetCard } = body as { groupId: string; qqNumber: string; targetCard: string };
  const workspace = await db.workspace.findUnique({ where: { qqGroupId: groupId }, select: { id: true } });
  const user = await db.user.findUnique({ where: { qqNumber }, select: { id: true, status: true } });
  if (!workspace || !user || user.status !== "ACTIVE") throw new AppError("NOT_FOUND", "未找到有效用户或群");
  const member = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } }, select: { leftAt: true },
  });
  if (!member || member.leftAt) throw new AppError("FORBIDDEN", "用户当前不在该工作空间群内");
  await db.$transaction(async (tx) => {
    const queued = await queueGroupCardSyncInTransaction(tx, user.id, {
      workspaceId: workspace.id, force: false, source: "internal_target_check",
    });
    if (targetCard !== queued.desiredCard) {
      throw new AppError("VALIDATION_ERROR", "targetCard 与当前网站规范名片不一致，请通过昵称或资料接口更新");
    }
  });
  const currentSummary = await getGroupCardSyncSummary(user.id);
  const targetGroup = currentSummary.groups.find((group) => group.groupId === groupId);
  if (targetGroup?.status === "synced" && targetGroup.confirmedCard === targetCard && targetGroup.desiredCard === targetCard) {
    return NextResponse.json({ data: {
      success: true, queued: false, groupCardSync: currentSummary,
    } });
  }
  await db.$transaction(async (tx) => {
    const queued = await queueGroupCardSyncInTransaction(tx, user.id, {
      workspaceId: workspace.id, force: true, source: "internal_retry",
    });
    if (targetCard !== queued.desiredCard) {
      throw new AppError("VALIDATION_ERROR", "网站名片目标已更新，请刷新当前目标后重试");
    }
  });
  await logBotAudit({ action: BOT_AUDIT_ACTIONS.BOT_GROUP_CARD_UPDATE_ATTEMPTED,
    qqNumber, groupId, metadata: { targetCard, queued: true } });
  return NextResponse.json({ data: {
    success: false, queued: true, groupCardSync: await getGroupCardSyncSummary(user.id),
  } }, { status: 202 });
});
