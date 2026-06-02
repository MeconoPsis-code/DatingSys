import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { db } from "@/lib/db";
import { createSession } from "@/lib/session";
import { logAudit, AUDIT_ACTIONS, getClientIp } from "@/lib/audit";

/**
 * GET /api/auth/callback?token=xxx
 *
 * User clicks the link from the bot's private message.
 * Validates the one-time token, upserts user + membership, creates session.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (!token) {
    return NextResponse.redirect(
      new URL("/login?error=missing_token", appUrl)
    );
  }

  // 1. Look up token in Redis
  const cacheKey = `auth:token:${token}`;
  const cached = await redis.get(cacheKey);

  if (!cached) {
    return NextResponse.redirect(
      new URL("/login?error=expired", appUrl)
    );
  }

  // 2. Immediately delete token (one-time use — prevents replay)
  await redis.del(cacheKey);

  const { qqNumber, groupId, nickname, avatarUrl } = JSON.parse(cached);

  try {
    // 3. Find existing user by QQ bot identity
    let user = await db.user.findFirst({
      where: {
        authIdentities: {
          some: {
            provider: "qq_bot",
            providerUserId: qqNumber,
          },
        },
      },
      include: { groupMembership: true },
    });

    if (!user) {
      // 4a. New user — create user + auth identity + auto-verified membership
      user = await db.user.create({
        data: {
          role: "USER",
          status: "ACTIVE",
          lastLoginAt: new Date(),
          authIdentities: {
            create: {
              provider: "qq_bot",
              providerUserId: qqNumber,
              openid: `bot_${qqNumber}`,
              nickname: nickname || null,
              avatarUrl: avatarUrl || null,
            },
          },
          groupMembership: {
            create: {
              qqNumber,
              groupId,
              status: "VERIFIED",
              verifiedAt: new Date(),
              expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
              remark: "Auto-verified via QQ bot",
            },
          },
        },
        include: { groupMembership: true },
      });
    } else {
      // 4b. Existing user — refresh membership and login time
      await db.$transaction([
        db.user.update({
          where: { id: user.id },
          data: {
            lastLoginAt: new Date(),
            authIdentities: {
              updateMany: {
                where: { provider: "qq_bot", providerUserId: qqNumber },
                data: {
                  nickname: nickname || undefined,
                  avatarUrl: avatarUrl || undefined,
                },
              },
            },
          },
        }),
        db.groupMembership.upsert({
          where: { userId: user.id },
          create: {
            userId: user.id,
            qqNumber,
            groupId,
            status: "VERIFIED",
            verifiedAt: new Date(),
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            remark: "Auto-verified via QQ bot",
          },
          update: {
            status: "VERIFIED",
            verifiedAt: new Date(),
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            remark: "Auto-verified via QQ bot (refreshed)",
          },
        }),
      ]);
    }

    // 5. Create session (JWT cookie)
    await createSession(user.id, user.role);

    // 6. Audit log
    await logAudit({
      actorId: user.id,
      action: AUDIT_ACTIONS.LOGIN,
      targetType: "User",
      targetId: user.id,
      metadata: { qqNumber, groupId, method: "bot_token" },
      ip: getClientIp(req),
      userAgent: req.headers.get("user-agent"),
    });

    // 7. Redirect to app
    return NextResponse.redirect(new URL("/profile", appUrl));
  } catch (error) {
    console.error("[Auth Callback] Error:", error);
    return NextResponse.redirect(
      new URL("/login?error=server_error", appUrl)
    );
  }
}
