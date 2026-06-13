import { NextRequest, NextResponse } from 'next/server';
import { BOT_CONFIG } from '@/server/bot/bot.config';
import { validateGroupCard } from '@/server/bot/group-card.service';

/**
 * POST /api/internal/bot/group-card/check
 *
 * Validate a group card string against the configured format rules.
 * Returns parsed components (age, province, nickname) and validity.
 *
 * Auth: Internal service secret via `x-internal-secret` header.
 */
export async function POST(req: NextRequest) {
  // Validate internal secret
  const secret = req.headers.get('x-internal-secret');
  if (!secret || secret !== BOT_CONFIG.internalSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { groupCard } = body;

  if (!groupCard) {
    return NextResponse.json({ error: 'groupCard is required' }, { status: 422 });
  }

  const { result, parsed } = validateGroupCard(groupCard);

  return NextResponse.json({
    data: {
      valid: result === 'valid',
      result,
      age: parsed?.age ?? null,
      province: parsed?.province ?? null,
      nickname: parsed?.nickname ?? null,
    },
  });
}
