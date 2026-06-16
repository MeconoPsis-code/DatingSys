import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { napcatClient } from "@/server/bot/clients/napcat.client";
import { createLogger } from "@/lib/logger";
import { getCityName } from "@/data/regions";

const log = createLogger("api:nickname");

/**
 * Compute age from birthDate.
 */
function computeAge(birthDate: Date): number {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

/**
 * Build a group card string in the format: age-city-nickname
 * If profile data is unavailable, just use the nickname alone.
 */
function buildGroupCard(nickname: string, profile: { birthDate: Date; provinceCode: string; cityCode: string } | null): string {
  if (!profile) return nickname;

  const age = computeAge(profile.birthDate);
  const cityName = getCityName(profile.provinceCode, profile.cityCode);

  // Use short city name (remove common suffixes like 市)
  const shortCity = cityName.replace(/市$/, "") || cityName;

  return `${age}-${shortCity}-${nickname}`;
}

/**
 * POST /api/account/nickname
 *
 * Change the user's nickname portion of the group card.
 * The full group card is composed as: age-address-nickname
 * Age and address are derived from the user's profile.
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

  // Fetch user's profile for age and city
  const profile = await db.profile.findUnique({
    where: { userId: session.id },
    select: { birthDate: true, provinceCode: true, cityCode: true },
  });

  // Build the full group card: age-city-nickname
  const groupCard = buildGroupCard(trimmed, profile);

  // 1. Update AuthIdentity nickname (store just the nickname part)
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
          groupCard
        );
        groupSynced = true;
        log.info(
          { qqNumber: session.qqNumber, groupId: membership.groupId, groupCard },
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
        data: { qqNickname: trimmed, groupCard },
      });
    } catch {
      // BotIdentity may not exist — non-critical
    }
  }

  return NextResponse.json({
    data: {
      nickname: trimmed,
      groupCard,
      groupSynced,
      message: groupSynced ? "群名片已更新并同步" : "群名片已更新",
    },
  });
}
