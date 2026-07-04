import { Prisma } from "@prisma/client";

import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { error, success } from "@/lib/api-response";
import { MATCH_PREF_COOLDOWN_MS } from "@/lib/match-pref-cooldown";
import {
  DATA_DELETE_COOLDOWN_MS,
  PROFILE_EDIT_COOLDOWN_MS,
  buildActiveUserCooldowns,
} from "@/lib/user-cooldowns";

// ── GET /api/admin/users/cooldowns ─────────────────────

export async function GET(req: Request) {
  try {
    await requireRole("ADMIN");

    const url = new URL(req.url);
    const search = url.searchParams.get("search")?.trim() || "";
    const now = new Date();
    const profileEditCutoff = new Date(now.getTime() - PROFILE_EDIT_COOLDOWN_MS);
    const dataDeleteCutoff = new Date(now.getTime() - DATA_DELETE_COOLDOWN_MS);
    const matchPoolCutoff = new Date(now.getTime() - MATCH_PREF_COOLDOWN_MS);
    const cooldownWhere: Prisma.UserWhereInput = {
      OR: [
        { status: "PENDING_DELETE" },
        { lastProfileClearedAt: { gt: dataDeleteCutoff } },
        {
          profile: {
            is: {
              OR: [
                { lastSubmittedAt: { gt: profileEditCutoff } },
                { matchPrefUpdatedAt: { gt: matchPoolCutoff } },
              ],
            },
          },
        },
      ],
    };
    const searchWhere: Prisma.UserWhereInput | undefined = search
      ? {
          OR: [
            { qqNumber: { contains: search } },
            { authIdentities: { some: { nickname: { contains: search } } } },
          ],
        }
      : undefined;

    const users = await db.user.findMany({
      where: {
        status: { not: "DELETED" },
        ...(searchWhere ? { AND: [cooldownWhere, searchWhere] } : cooldownWhere),
      },
      include: {
        authIdentities: { select: { nickname: true }, take: 1 },
        profile: {
          select: {
            lastSubmittedAt: true,
            matchPrefUpdatedAt: true,
            draftData: true,
          },
        },
        auditLogs: {
          where: { action: "ACCOUNT_DELETE_REQUEST" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const data = users
      .map((user) => {
        const cooldowns = buildActiveUserCooldowns(
          {
            status: user.status,
            updatedAt: user.updatedAt,
            lastProfileClearedAt: user.lastProfileClearedAt,
            profile: user.profile,
            accountDeleteRequestedAt: user.auditLogs[0]?.createdAt ?? null,
          },
          now,
        );

        return {
          id: user.id,
          qqNumber: user.qqNumber,
          nickname: user.authIdentities[0]?.nickname ?? null,
          role: user.role,
          status: user.status,
          cooldowns,
        };
      })
      .filter((user) => user.cooldowns.length > 0)
      .sort((a, b) => {
        const aFirst = a.cooldowns[0];
        const bFirst = b.cooldowns[0];
        if (!aFirst || !bFirst) return 0;
        if (aFirst.type === "DATA_DELETE" && bFirst.type !== "DATA_DELETE") {
          return -1;
        }
        if (aFirst.type !== "DATA_DELETE" && bFirst.type === "DATA_DELETE") {
          return 1;
        }
        return aFirst.endsAt.getTime() - bFirst.endsAt.getTime();
      });

    return success({ users: data, total: data.length });
  } catch (err) {
    console.error("[admin/users/cooldowns] GET error:", err);
    if (err && typeof err === "object" && "status" in err) {
      const appErr = err as { code: string; message: string; status: number };
      return error(appErr.code, appErr.message, appErr.status);
    }
    return error("INTERNAL_ERROR", "服务器内部错误", 500);
  }
}
