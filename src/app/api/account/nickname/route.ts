import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { napcatClient } from "@/server/bot/clients/napcat.client";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:nickname");

/**
 * POST /api/account/nickname
 *
 * Change the user's nickname. Also syncs to QQ group card via NapCat.
 *
 * Body: { nickname: string }
 */
export async function POST(req: NextRequest) {
  const session = await requireAuth();

  const body = await req.json();
  const { nickname } = body;

  if (!nickname || typeof nickname !== "string") {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "请输入昵称" } },
      { status: 422 }
    );
  }

  const trimmed = nickname.trim();

  if (trimmed.length === 0 || trimmed.length > 30) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "昵称长度需在 1-30 个字符之间" } },
      { status: 422 }
    );
  }

  // 1. Update AuthIdentity nickname
  await db.authIdentity.updateMany({
    where: { userId: session.id },
    data: { nickname: trimmed },
  });

  // 2. Sync to QQ group card via NapCat (non-critical)
  let groupSynced = false;
  if (session.qqNumber) {
    try {
      // Find the user's group membership to get the groupId
      const membership = await db.groupMembership.findUnique({
        where: { userId: session.id },
        select: { groupId: true },
      });

      if (membership && membership.groupId && membership.groupId !== "default") {
        await napcatClient.setGroupCard(
          membership.groupId,
          session.qqNumber,
          trimmed
        );
        groupSynced = true;
        log.info(
          { qqNumber: session.qqNumber, groupId: membership.groupId, nickname: trimmed },
          "Group card synced"
        );
      }
    } catch (err) {
      // Log but don't fail the request — group card sync is best-effort
      log.warn(
        { err, qqNumber: session.qqNumber },
        "Failed to sync group card (non-critical)"
      );
    }
  }

  // 3. Also update BotIdentity if it exists
  if (session.qqNumber) {
    try {
      await db.botIdentity.update({
        where: { qqNumber: session.qqNumber },
        data: { qqNickname: trimmed, groupCard: trimmed },
      });
    } catch {
      // BotIdentity may not exist — non-critical
    }
  }

  return NextResponse.json({
    data: {
      nickname: trimmed,
      groupSynced,
      message: groupSynced ? "昵称已更新，群名片已同步" : "昵称已更新",
    },
  });
}
