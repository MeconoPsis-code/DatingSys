import { NextRequest, NextResponse } from 'next/server';
import { BOT_CONFIG } from '@/server/bot/bot.config';
import { napcatClient } from '@/server/bot/clients/napcat.client';
import {
  logBotAction,
  logBotAudit,
  BOT_AUDIT_ACTIONS,
} from '@/server/bot/bot-audit.service';
import { createLogger } from '@/lib/logger';

const log = createLogger('bot:group-card-update');

/**
 * POST /api/internal/bot/group-card/update
 *
 * Set the group card (群名片) for a member via NapCat API.
 * Logs the attempt, success, or failure to both BotActionLog and AuditLog.
 *
 * Auth: Internal service secret via `x-internal-secret` header.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-internal-secret');
  if (!secret || secret !== BOT_CONFIG.internalSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { groupId, qqNumber, targetCard } = body;

  if (!groupId || !qqNumber || !targetCard) {
    return NextResponse.json(
      { error: 'groupId, qqNumber, and targetCard are required' },
      { status: 422 },
    );
  }

  await logBotAudit({
    action: BOT_AUDIT_ACTIONS.BOT_GROUP_CARD_UPDATE_ATTEMPTED,
    qqNumber,
    groupId,
    metadata: { targetCard },
  });

  try {
    await napcatClient.setGroupCard(groupId, qqNumber, targetCard);

    await logBotAction({
      action: 'set_group_card',
      groupId,
      qqNumber,
      status: 'success',
      request: { targetCard },
    });

    await logBotAudit({
      action: BOT_AUDIT_ACTIONS.BOT_GROUP_CARD_UPDATE_SUCCESS,
      qqNumber,
      groupId,
    });

    return NextResponse.json({ data: { success: true } });
  } catch (err) {
    log.error({ err, qqNumber, groupId }, 'Failed to update group card');

    await logBotAction({
      action: 'set_group_card',
      groupId,
      qqNumber,
      status: 'failed',
      errorMessage: err instanceof Error ? err.message : 'Unknown error',
    });

    await logBotAudit({
      action: BOT_AUDIT_ACTIONS.BOT_GROUP_CARD_UPDATE_FAILED,
      qqNumber,
      groupId,
      metadata: { error: err instanceof Error ? err.message : 'Unknown' },
    });

    return NextResponse.json(
      {
        error: {
          code: 'GROUP_CARD_UPDATE_FAILED',
          message: '群名片修改失败',
        },
      },
      { status: 500 },
    );
  }
}
