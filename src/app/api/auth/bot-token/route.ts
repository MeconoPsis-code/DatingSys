import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { redis } from "@/lib/redis";
import { logAudit, AUDIT_ACTIONS, getClientIp } from "@/lib/audit";

/**
 * POST /api/auth/bot-token
 *
 * Internal endpoint called by the QQ Bot to request a one-time login token.
 * The bot must authenticate using the X-Bot-Secret header.
 *
 * Request body: { qqNumber, groupId, nickname?, avatarUrl? }
 * Response: { token } — the bot sends this as a link to the user via private message.
 */
export async function POST(req: NextRequest) {
  // 1. Authenticate the bot
  const botSecret = req.headers.get("x-bot-secret");
  if (!botSecret || botSecret !== process.env.BOT_INTERNAL_SECRET) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Invalid bot secret" } },
      { status: 401 }
    );
  }

  // 2. Parse request
  const body = await req.json();
  const { qqNumber, groupId, nickname, avatarUrl } = body;

  if (!qqNumber || !groupId) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "qqNumber and groupId are required" } },
      { status: 422 }
    );
  }

  // 3. Generate a cryptographically secure random token
  const token = crypto.randomBytes(32).toString("hex");

  // 4. Store in Redis with 5-minute TTL (one-time use)
  const cacheKey = `auth:token:${token}`;
  const cacheData = JSON.stringify({
    qqNumber: String(qqNumber),
    groupId: String(groupId),
    nickname: nickname || null,
    avatarUrl: avatarUrl || null,
  });
  await redis.setex(cacheKey, 300, cacheData);

  // 5. Audit log
  await logAudit({
    action: AUDIT_ACTIONS.BOT_TOKEN_ISSUED,
    targetType: "AuthToken",
    metadata: { qqNumber, groupId },
    ip: getClientIp(req),
  });

  // 6. Return token — bot constructs the URL and sends to user
  return NextResponse.json({ token });
}
