import { acceptGroupCardEvent } from "@/server/bot/group-card-sync.service";
import type { QQBotClient } from "./clients/qqbot-client.interface";
import type { OneBotRawEvent } from "./bot.types";

/** A durable OneBot card change; timestamp and transition are retained for adjudication. */
export interface GroupCardChangedEvent {
  eventId: string;
  groupId: string;
  qqNumber: string;
  cardNew: string;
  cardOld: string;
  timestamp: number;
  selfId: string;
  operatorId?: string;
  rawEvent: OneBotRawEvent;
}

/** Persist first. The coordinator reads current QQ values before choosing a nickname. */
export async function handleGroupCardChanged(
  event: GroupCardChangedEvent,
  _client?: QQBotClient,
  workspaceId?: string,
): Promise<{ duplicate: boolean }> {
  if (!workspaceId) {
    const { db } = await import("@/lib/db");
    workspaceId = (await db.workspace.findUnique({ where: { qqGroupId: event.groupId }, select: { id: true } }))?.id;
  }
  if (!workspaceId) return { duplicate: false };
  return acceptGroupCardEvent(event, workspaceId);
}
