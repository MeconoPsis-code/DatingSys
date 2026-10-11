import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiHandler, parseJsonRequest } from "@/lib/api-handler";
import {
  getGroupCardSyncView,
  NicknameRevisionConflictError,
  queueGroupCardSyncInTransaction,
} from "@/server/bot/group-card-sync.service";

/** Save the website nickname and durable QQ delivery work in one transaction. */
export const POST = apiHandler(async (req) => {
  const session = await requireAuth();

  const body = await parseJsonRequest<{ nickname?: unknown; baseNicknameRevision?: unknown }>(req);
  if (typeof body.nickname !== "string" ||
      (body.baseNicknameRevision !== undefined &&
        (!Number.isSafeInteger(body.baseNicknameRevision) || Number(body.baseNicknameRevision) < 0))) {
    return NextResponse.json({ error: {
      code: "VALIDATION_ERROR", message: "请输入昵称并刷新当前昵称版本",
    } }, { status: 422 });
  }
  try {
    const result = await db.$transaction((tx) => queueGroupCardSyncInTransaction(tx, session.id, {
      nickname: body.nickname as string,
      baseNicknameRevision: body.baseNicknameRevision as number | undefined,
      source: "website_nickname",
      force: true,
    }));
    const { nickname, nicknameRevision, groupCardSync } = await getGroupCardSyncView(session.id);
    return NextResponse.json({ data: {
      nickname,
      nicknameRevision,
      groupCard: groupCardSync.groups[0]?.desiredCard ?? result.desiredCard,
      groupSynced: groupCardSync.status === "synced",
      groupCardSync,
      message: groupCardSync.status === "synced" ? "网站昵称已保存，QQ 群名片已确认同步" : "网站昵称已保存，QQ 群名片等待同步",
    } });
  } catch (cause) {
    if (cause instanceof NicknameRevisionConflictError) {
      return NextResponse.json({ error: {
        code: "NICKNAME_CONFLICT", message: "昵称已在其他页面或 QQ 更新，请刷新后重试",
        currentNickname: cause.currentNickname, currentRevision: cause.currentRevision,
      } }, { status: 409 });
    }
    throw cause;
  }
});
