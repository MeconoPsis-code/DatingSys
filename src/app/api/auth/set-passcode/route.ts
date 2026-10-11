import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import { consumeVerifiedFlag } from "@/lib/verification";
import { validatePasscode, hashPassword } from "@/lib/password";
import { createSession } from "@/lib/session";
import { logAudit, AUDIT_ACTIONS, getClientIp } from "@/lib/audit";
import { normalizeNicknameInput } from "@/lib/group-card";
import { apiHandler, parseJsonRequest } from "@/lib/api-handler";
import { workspaceForGroup } from "@/lib/workspace-auth";
import { getGroupCardSyncView, queueGroupCardSyncInTransaction } from "@/server/bot/group-card-sync.service";
import { lockRatingUserTasks } from "@/lib/rating-profile-sync";

/**
 * POST /api/auth/set-passcode
 *
 * After email verification, user sets their passcode to complete signup.
 * Requires the "verified" flag in Redis (set by verify-code endpoint).
 */
export const POST = apiHandler(async (req) => {
  const body = await parseJsonRequest<{
    qqNumber?: unknown;
    passcode?: unknown;
  }>(req);
  const { qqNumber, passcode } = body;

  if (
    (typeof qqNumber !== "string" && typeof qqNumber !== "number") ||
    typeof passcode !== "string" ||
    !qqNumber ||
    !passcode
  ) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "请输入QQ号和密码" } },
      { status: 422 }
    );
  }

  const qqStr = String(qqNumber);

  // 1. Check verification flag
  const verified = await consumeVerifiedFlag(qqStr);
  if (!verified) {
    return NextResponse.json(
      { error: { code: "NOT_VERIFIED", message: "请先完成邮箱验证" } },
      { status: 403 }
    );
  }

  // 2. Validate passcode rules
  const validation = validatePasscode(passcode);
  if (!validation.valid) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: validation.message } },
      { status: 422 }
    );
  }

  // 3. Hash passcode
  const passwordHash = await hashPassword(passcode);

  // 4. Retrieve bot context (groupId, nickname, avatarUrl, groupCard)
  const contextKey = `auth:context:${qqStr}`;
  const contextRaw = await redis.get(contextKey);
  const context = contextRaw ? JSON.parse(contextRaw) : {};
  await redis.del(contextKey);
  const workspace = context.groupId
    ? await workspaceForGroup(String(context.groupId))
    : await db.workspace.findUnique({ where: { slug: "official" } });

  // Avatar URL: use context or generate from QQ number
  const avatarUrl = context.avatarUrl || `https://q1.qlogo.cn/g?b=qq&nk=${qqStr}&s=640`;
  // Registration handlers already extracted this nickname from the QQ card.
  // Preserve a nickname that itself happens to resemble a complete card.
  const contextNickname = (typeof context.nickname === "string" && context.nickname.trim()
    ? context.nickname.trim()
    : typeof context.groupCard === "string" ? normalizeNicknameInput(context.groupCard) : "") || null;

  // 5. Create or update user with credentials
  const { user } = await db.$transaction(async (tx) => {
  let user = await tx.user.findUnique({ where: { qqNumber: qqStr } });
  const isNewUser = !user;
  if (user) await lockRatingUserTasks(tx, user.id);

  if (!user) {
    // New user — full creation with QQ portrait and nickname
    user = await tx.user.create({
      data: {
        qqNumber: qqStr,
        passwordHash,
        role: "USER",
        status: "ACTIVE",
        lastLoginAt: new Date(),
        sourceWorkspaceId: workspace?.id,
        authIdentities: {
          create: {
            provider: "qq_bot",
            providerUserId: qqStr,
            openid: `bot_${qqStr}`,
            nickname: contextNickname,
            avatarUrl,
          },
        },
        groupMembership: {
          create: {
            qqNumber: qqStr,
            groupId: context.groupId || "default",
            status: "VERIFIED",
            verifiedAt: new Date(),
            remark: "Auto-verified via bot signup",
          },
        },
        ...(workspace ? { workspaceMembers: {
          create: { workspaceId: workspace.id, role: "MEMBER" },
        } } : {}),
      },
    });
  } else {
    // Existing user (e.g., seeded) — set password and update identity
    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        lastLoginAt: new Date(),
        sourceWorkspaceId: user.sourceWorkspaceId ?? workspace?.id,
      },
    });
    if (workspace) await tx.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
      create: { workspaceId: workspace.id, userId: user.id, role: "MEMBER" },
      update: { leftAt: null, joinedAt: new Date() },
    });
    if (!(await tx.groupMembership.findUnique({ where: { userId: user.id } }))) {
      await tx.groupMembership.create({
        data: {
          userId: user.id,
          qqNumber: qqStr,
          groupId: context.groupId || "default",
          status: "VERIFIED",
          verifiedAt: new Date(),
          remark: "Auto-verified via bot signup",
        },
      });
    }

    // An old signup context must not overwrite an existing current nickname.
    const currentIdentity = await tx.authIdentity.findFirst({
      where: { userId: user.id }, orderBy: { createdAt: "asc" }, select: { nickname: true },
    });
    await tx.authIdentity.upsert({
      where: {
        provider_openid: {
          provider: "qq_bot",
          openid: `bot_${qqStr}`,
        },
      },
      update: {
        avatarUrl,
      },
      create: {
        userId: user.id,
        provider: "qq_bot",
        providerUserId: qqStr,
        openid: `bot_${qqStr}`,
        nickname: currentIdentity?.nickname ?? contextNickname,
        avatarUrl,
      },
    });
  }
  const queued = await queueGroupCardSyncInTransaction(tx, user.id, {
    source: "signup",
    initialize: isNewUser,
    sourceGroupId: workspace?.qqGroupId,
    ...(isNewUser ? {
      baselineCard: typeof context.groupCard === "string" ? context.groupCard : "",
      baselineGroupId: workspace?.qqGroupId,
    } : {}),
  });
  await tx.botIdentity.updateMany({
      where: { qqNumber: qqStr },
      data: {
        qqNickname: queued.nickname,
      },
  });
  return { user };
  });

  // 6. Check if user already has a profile (e.g. seeded users)
  const existingProfile = await db.profile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });

  // 7. Create session
  await createSession(user.id, user.role, !!existingProfile);

  // 7. Audit log
  await logAudit({
    actorId: user.id,
    action: AUDIT_ACTIONS.LOGIN,
    targetType: "User",
    targetId: user.id,
    metadata: { qqNumber: qqStr, method: "signup" },
    ip: getClientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return NextResponse.json({
    data: { success: true, message: "注册成功", ...await getGroupCardSyncView(user.id) },
  });
});
