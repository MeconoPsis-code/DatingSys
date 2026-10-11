import { NextRequest, NextResponse } from 'next/server';
import { BOT_CONFIG, isTargetGroup } from '@/server/bot/bot.config';
import { normalizeEvent } from '@/server/bot/bot-event-normalizer';
import { logBotEvent } from '@/server/bot/bot-audit.service';
import { handleRegisterCommand } from '@/server/bot/register-command.handler';
import { handlePasswordResetCommand } from '@/server/bot/password-reset-command.handler';
import { handleGroupMemberJoined } from '@/server/bot/group-member-joined.handler';
import { handleGroupMemberLeft } from '@/server/bot/group-member-left.handler';
import { handleGroupCardChanged } from '@/server/bot/group-card-changed.handler';
import { napcatClient } from '@/server/bot/clients/napcat.client';
import { redis } from '@/lib/redis';
import { workspaceForGroup, isWorkspaceOperational } from '@/lib/workspace-auth';
import { createLogger } from '@/lib/logger';
import type { OneBotRawEvent } from '@/server/bot/bot.types';

const log = createLogger('bot:webhook');

// Event dedup TTL (5 minutes)
const DEDUP_TTL = 300;

/**
 * POST /api/bot/napcat/webhook
 *
 * Receives OneBot v11 events from NapCat via HTTP POST.
 * Validates authentication, normalizes events, and dispatches to handlers.
 *
 * Card notices are acknowledged only after durable inbox persistence.
 */
export async function POST(req: NextRequest) {
  // 1. Read raw body (needed for both HMAC verification and JSON parsing)
  const rawBody = await req.text();

  // 2. Validate webhook authentication
  // NapCat HTTP Client sends HMAC-SHA1 signature in X-Signature header
  // Format: "sha1=<hex_digest>" where digest = HMAC-SHA1(token, body)
  const xSignature = req.headers.get('x-signature') || '';
  const authHeader = req.headers.get('authorization') || '';
  const xBotToken = req.headers.get('x-bot-token') || '';

  let authenticated = false;

  if (xSignature && BOT_CONFIG.webhookToken) {
    // HMAC-SHA1 signature verification (NapCat HTTP Client mode)
    const { createHmac } = await import('crypto');
    const expectedSig = 'sha1=' + createHmac('sha1', BOT_CONFIG.webhookToken)
      .update(rawBody)
      .digest('hex');
    authenticated = xSignature === expectedSig;
  }

  if (!authenticated && xBotToken) {
    authenticated = xBotToken === BOT_CONFIG.webhookToken;
  }

  if (!authenticated && authHeader) {
    const bearerToken = authHeader.replace(/^(?:Bearer|Token)\s+/i, '');
    authenticated = bearerToken === BOT_CONFIG.webhookToken;
  }

  if (!authenticated) {
    log.warn({
      hasXSig: !!xSignature,
      hasAuth: !!authHeader,
      hasBotToken: !!xBotToken,
    }, 'Invalid webhook token');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 3. Parse payload
  let rawEvent: OneBotRawEvent;
  try {
    rawEvent = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ status: 'ok' });
  }

  // 4. Normalize event
  const normalized = normalizeEvent(rawEvent);

  if (normalized.type === 'ignored') {
    return NextResponse.json({ status: 'ok' });
  }
  const groupId = normalized.event.groupId;
  if (!isTargetGroup(groupId)) {
    log.debug({ groupId }, 'Non-target group, ignoring');
    return NextResponse.json({ status: 'ok' });
  }
  // Card notices must be committed before acknowledging. Other events retain
  // the existing target-group dispatch and Redis dedup behavior.
  if (normalized.type === 'group_card_changed') {
    try {
      const workspace = await workspaceForGroup(groupId);
      if (!workspace || !isWorkspaceOperational(workspace) || !workspace.botEnabled) {
        return NextResponse.json({ status: 'ok' });
      }
      await handleGroupCardChanged(normalized.event, napcatClient, workspace.id);
      return NextResponse.json({ status: 'ok' });
    } catch (err) {
      log.error({ err, eventId: normalized.event.eventId }, 'Failed to persist group card notice');
      return NextResponse.json({ error: 'Card notice persistence unavailable' }, { status: 503 });
    }
  }
  await logBotEvent({
    eventId: normalized.event.eventId, platform: 'napcat', eventType: normalized.type,
    groupId, qqNumber: normalized.event.qqNumber,
    messageText: normalized.type === 'group_message' ? normalized.event.messageText : undefined,
    rawPayload: rawEvent,
  });
  const eventId = normalized.event.eventId;
  const dedupKey = `bot:dedup:${eventId}`;
  const isDuplicate = await redis.set(dedupKey, '1', 'EX', DEDUP_TTL, 'NX');
  if (isDuplicate === null) {
    log.debug({ eventId }, 'Duplicate event, skipping');
    return NextResponse.json({ status: 'ok' });
  }

  // 8. Dispatch to handler (non-blocking — always return 200)
  try {
    switch (normalized.type) {
      case 'group_message': {
        const text = normalized.event.messageText.trim();
        if (text === BOT_CONFIG.commands.register) {
          await handleRegisterCommand(normalized.event, napcatClient);
        } else if (text === BOT_CONFIG.commands.passwordReset) {
          await handlePasswordResetCommand(normalized.event, napcatClient);
        }
        // Other messages are ignored (normal chat)
        break;
      }
      case 'group_member_joined':
        await handleGroupMemberJoined(normalized.event, napcatClient);
        break;
      case 'group_member_left':
        await handleGroupMemberLeft(normalized.event);
        break;
    }
  } catch (err) {
    log.error({ err, eventId, type: normalized.type }, 'Handler error');
    // Update BotEventLog with error
    await logBotEvent({
      eventId,
      platform: 'napcat',
      eventType: normalized.type,
      rawPayload: rawEvent,
      handled: false,
      errorMessage: err instanceof Error ? err.message : 'Unknown error',
    });
  }

  return NextResponse.json({ status: 'ok' });
}
