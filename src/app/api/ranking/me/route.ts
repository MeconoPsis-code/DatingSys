import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { success, error } from "@/lib/api-response";

const updateSchema = z.object({
  optIn: z.boolean(),
});

function toRankingSettings(ratingProfile: {
  ratingStatus: string;
  finalScore: number | null;
  scoreCompletedAt: Date | null;
  rankingOptIn: boolean;
  rankingOptInUpdatedAt: Date | null;
} | null) {
  const canJoin =
    ratingProfile?.ratingStatus === "COMPLETED" &&
    ratingProfile.finalScore !== null;

  return {
    canJoin,
    ratingStatus: ratingProfile?.ratingStatus ?? "NOT_SUBMITTED",
    finalScore: ratingProfile?.finalScore ?? null,
    scoreCompletedAt: ratingProfile?.scoreCompletedAt ?? null,
    rankingOptIn: canJoin ? Boolean(ratingProfile?.rankingOptIn) : false,
    rankingOptInUpdatedAt: ratingProfile?.rankingOptInUpdatedAt ?? null,
  };
}

export async function GET() {
  try {
    const session = await requireAuth();
    const ratingProfile = await db.ratingProfile.findUnique({
      where: { userId: session.id },
      select: {
        ratingStatus: true,
        finalScore: true,
        scoreCompletedAt: true,
        rankingOptIn: true,
        rankingOptInUpdatedAt: true,
      },
    });

    return success(toRankingSettings(ratingProfile));
  } catch (err) {
    console.error("[ranking/me] GET error:", err);
    if (err && typeof err === "object" && "status" in err) {
      const appErr = err as { code: string; message: string; status: number };
      return error(appErr.code, appErr.message, appErr.status);
    }
    return error("INTERNAL_ERROR", "服务器内部错误", 500);
  }
}

export async function PUT(req: Request) {
  try {
    const session = await requireAuth();

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return error("VALIDATION_ERROR", "无效的请求体", 422);
    }

    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return error("VALIDATION_ERROR", "请选择是否参与排行", 422);
    }

    const ratingProfile = await db.ratingProfile.findUnique({
      where: { userId: session.id },
      select: {
        ratingStatus: true,
        finalScore: true,
      },
    });

    const canJoin =
      ratingProfile?.ratingStatus === "COMPLETED" &&
      ratingProfile.finalScore !== null;

    if (parsed.data.optIn && !canJoin) {
      return error("RANKING_NOT_AVAILABLE", "评分完成后才能参与排行", 403);
    }

    if (!ratingProfile) {
      return error("RATING_PROFILE_NOT_FOUND", "暂无评分资料", 404);
    }

    const updated = await db.ratingProfile.update({
      where: { userId: session.id },
      data: {
        rankingOptIn: parsed.data.optIn,
        rankingOptInUpdatedAt: new Date(),
      },
      select: {
        ratingStatus: true,
        finalScore: true,
        scoreCompletedAt: true,
        rankingOptIn: true,
        rankingOptInUpdatedAt: true,
      },
    });

    return success(toRankingSettings(updated));
  } catch (err) {
    console.error("[ranking/me] PUT error:", err);
    if (err && typeof err === "object" && "status" in err) {
      const appErr = err as { code: string; message: string; status: number };
      return error(appErr.code, appErr.message, appErr.status);
    }
    return error("INTERNAL_ERROR", "服务器内部错误", 500);
  }
}
