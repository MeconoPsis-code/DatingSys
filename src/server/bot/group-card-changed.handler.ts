/**
 * @file group-card-changed.handler.ts
 * @description Handles QQ group card (名片) change events from NapCat.
 *
 * When a user changes their group card in QQ:
 * 1. Parse the new card to see if it follows "age-city-nickname" format
 * 2. If yes → extract nickname and sync to website (AuthIdentity)
 * 3. If no  → treat entire new card as nickname, fetch age+city from
 *             the user's website profile, compose correct card, set it
 *             back on QQ, and sync nickname to website
 *
 * Both ends (QQ group card + website AuthIdentity) are kept in sync.
 */

import { db } from "@/lib/db";
import { getProvinceName } from "@/data/regions";
import { createLogger } from "@/lib/logger";
import type { QQBotClient } from "./clients/qqbot-client.interface";

const log = createLogger("bot:group-card-changed");

/** Event shape for group_card notice from OneBot v11 */
export interface GroupCardChangedEvent {
  groupId: string;
  qqNumber: string;
  cardNew: string;
  cardOld: string;
}

/**
 * Compute age from a Date.
 */
function computeAge(birthDate: Date): number {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

/**
 * Try to parse "age-city-nickname" from a card string.
 * Returns { age, city, nickname } or null if format doesn't match.
 *
 * Rules:
 * - Must have at least 2 dashes → 3 parts
 * - First part must be a valid integer (age)
 * - Second part is city (non-empty)
 * - Third+ parts (joined) is nickname (non-empty)
 */
function parseGroupCard(card: string): { age: number; city: string; nickname: string } | null {
  if (!card) return null;

  const parts = card.split("-");
  if (parts.length < 3) return null;

  const ageStr = parts[0].trim();
  const age = Number(ageStr);
  if (!Number.isInteger(age) || age < 1 || age > 120) return null;

  const city = parts[1].trim();
  if (!city) return null;

  // nickname = everything after the second dash (allows dashes in nicknames)
  const nickname = parts.slice(2).join("-").trim();
  if (!nickname) return null;

  return { age, city, nickname };
}

/**
 * Handle a group card change event.
 */
export async function handleGroupCardChanged(
  event: GroupCardChangedEvent,
  client: QQBotClient,
): Promise<void> {
  const { groupId, qqNumber, cardNew, cardOld } = event;

  log.info(
    { qqNumber, groupId, cardOld, cardNew },
    "Group card changed detected",
  );

  // Ignore empty new cards (card was cleared)
  if (!cardNew || !cardNew.trim()) {
    log.debug({ qqNumber }, "New card is empty, ignoring");
    return;
  }

  // Find the user by QQ number
  const user = await db.user.findFirst({
    where: { qqNumber },
    include: {
      profile: {
        select: { birthDate: true, provinceCode: true, cityCode: true },
      },
      authIdentities: {
        select: { id: true, nickname: true },
        take: 1,
      },
    },
  });

  if (!user) {
    log.debug({ qqNumber }, "User not found in database, ignoring card change");
    return;
  }

  // Parse the new card
  const parsed = parseGroupCard(cardNew);

  let newNickname: string;
  let correctCard: string;

  if (parsed) {
    // Card follows "age-city-nickname" format → extract nickname
    newNickname = parsed.nickname;
    log.info({ qqNumber, nickname: newNickname }, "Card follows format, extracting nickname");
  } else {
    // Card doesn't follow format → treat entire card as the new nickname
    newNickname = cardNew.trim();
    log.info({ qqNumber, nickname: newNickname }, "Card doesn't follow format, treating as nickname");
  }

  // Ensure nickname is valid (non-empty, max 30 chars)
  if (!newNickname || newNickname.length === 0) {
    log.debug({ qqNumber }, "Extracted nickname is empty, ignoring");
    return;
  }
  if (newNickname.length > 30) {
    newNickname = newNickname.slice(0, 30);
  }

  // Build the correct card from the user's profile
  if (user.profile) {
    const age = computeAge(user.profile.birthDate);
    const provinceName = getProvinceName(
      user.profile.provinceCode,
    ).replace(/省$|市$|自治区$|特别行政区$|壮族自治区$|回族自治区$|维吾尔自治区$/, "");
    correctCard = `${age}-${provinceName}-${newNickname}`;
  } else {
    // No profile → just use the nickname as-is
    correctCard = newNickname;
  }

  // 1. Sync nickname to AuthIdentity on the website
  if (user.authIdentities.length > 0) {
    const currentNickname = user.authIdentities[0].nickname;
    if (currentNickname !== newNickname) {
      await db.authIdentity.update({
        where: { id: user.authIdentities[0].id },
        data: { nickname: newNickname },
      });
      log.info({ qqNumber, oldNickname: currentNickname, newNickname }, "Website nickname synced");
    }
  }

  // 2. Update BotIdentity
  try {
    await db.botIdentity.update({
      where: { qqNumber },
      data: { groupCard: correctCard, qqNickname: newNickname },
    });
  } catch {
    // BotIdentity may not exist — non-critical
  }

  // 3. If the card on QQ is not in the correct format, set it back
  if (cardNew.trim() !== correctCard) {
    try {
      await client.setGroupCard(groupId, qqNumber, correctCard);
      log.info(
        { qqNumber, wrongCard: cardNew, correctedCard: correctCard },
        "Group card corrected on QQ",
      );
    } catch (err) {
      log.warn(
        { err, qqNumber },
        "Failed to correct group card on QQ (non-critical)",
      );
    }
  } else {
    log.debug({ qqNumber, correctCard }, "Card already in correct format");
  }
}
