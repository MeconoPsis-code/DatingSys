import { NextRequest, NextResponse } from 'next/server';
import { BOT_CONFIG } from '@/server/bot/bot.config';
import { syncAvatar } from '@/server/bot/avatar-sync.service';
import { logBotAudit, BOT_AUDIT_ACTIONS } from '@/server/bot/bot-audit.service';
import { createLogger } from '@/lib/logger';

const log = createLogger('bot:avatar-sync-api');

/**
 * POST /api/internal/bot/avatar-sync
 *
 * Synchronize a user's QQ avatar URL into the BotIdentity table.
 * Generates the CDN URL from the QQ number and upserts the record.
 *
 * Auth: Internal service secret via `x-internal-secret` header.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-internal-secret');
  if (!secret || secret !== BOT_CONFIG.internalSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { qqNumber } = body;

  if (!qqNumber) {
    return NextResponse.json({ error: 'qqNumber is required' }, { status: 422 });
  }

  try {
    await syncAvatar(String(qqNumber));
    await logBotAudit({
      action: BOT_AUDIT_ACTIONS.BOT_AVATAR_SYNCED,
      qqNumber: String(qqNumber),
    });
    return NextResponse.json({ data: { success: true } });
  } catch (err) {
    log.error({ err, qqNumber }, 'Avatar sync failed');
    return NextResponse.json(
      {
        error: {
          code: 'AVATAR_SYNC_FAILED',
          message: '头像同步失败',
        },
      },
      { status: 500 },
    );
  }
}
