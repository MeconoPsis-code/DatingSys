import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getSignedUrl } from "@/lib/storage";
import { success, error } from "@/lib/api-response";

/**
 * GET /api/scoring/tasks
 *
 * List rating tasks for the current scorer.
 * Query params:
 *   - status: "pending" (default) | "completed"
 */
export async function GET(req: Request) {
  const session = await requireAuth();

  if (!can(session.role, "SCORE_PHOTO")) {
    return error("FORBIDDEN", "无权访问评分功能", 403);
  }

  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get("status") || "pending";

  if (statusFilter === "pending") {
    // Tasks not yet scored by this user
    const tasks = await db.ratingTask.findMany({
      where: {
        status: { in: ["PENDING", "SCORING"] },
        // Exclude scorer's own profile
        ratedUserId: { not: session.id },
        scores: {
          none: { scorerUserId: session.id },
        },
      },
      include: {
        ratedUser: {
          include: {
            profile: {
              select: {
                birthDate: true,
                heightCm: true,
                weightKg: true,
                attribute: true,
                customAttribute: true,
              },
            },
          },
        },
        scores: {
          select: { id: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    // Enrich with photos + signed URLs
    const enriched = await Promise.all(
      tasks.map(async (task) => {
        const photos = await db.profilePhoto.findMany({
          where: {
            profile: { userId: task.ratedUserId },
          },
          orderBy: { order: "asc" },
        });

        const photosWithUrls = await Promise.all(
          photos.map(async (p) => ({
            id: p.id,
            order: p.order,
            url: await getSignedUrl(p.storageKey, 3600),
          }))
        );

        const scorerSnapshot = task.scorerSnapshot as string[];
        const scoredCount = task.scores.length;
        // Exclude SUPER_ADMIN from total (they review, not score)
        const eligibleInSnapshot = await db.user.count({
          where: { id: { in: scorerSnapshot }, role: { in: ["SCORER", "ADMIN"] } },
        });
        const totalScorers = eligibleInSnapshot;

        return {
          id: task.id,
          status: task.status,
          createdAt: task.createdAt,
          progress: { scored: scoredCount, total: totalScorers },
          profile: task.ratedUser.profile
            ? {
                birthDate: task.ratedUser.profile.birthDate,
                heightCm: task.ratedUser.profile.heightCm,
                weightKg: task.ratedUser.profile.weightKg,
                attribute: task.ratedUser.profile.attribute,
                customAttribute: task.ratedUser.profile.customAttribute,
              }
            : null,
          photos: photosWithUrls,
        };
      })
    );

    return success({ tasks: enriched });
  }

  if (statusFilter === "completed") {
    // Tasks already scored by this user
    const scores = await db.ratingScore.findMany({
      where: { scorerUserId: session.id },
      include: {
        ratingTask: {
          include: {
            ratedUser: {
              include: {
                profile: {
                  select: {
                    birthDate: true,
                    heightCm: true,
                    weightKg: true,
                    attribute: true,
                    customAttribute: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const enriched = await Promise.all(
      scores.map(async (s) => {
        const photos = await db.profilePhoto.findMany({
          where: {
            profile: { userId: s.ratingTask.ratedUserId },
          },
          orderBy: { order: "asc" },
        });

        const photosWithUrls = await Promise.all(
          photos.map(async (p) => ({
            id: p.id,
            order: p.order,
            url: await getSignedUrl(p.storageKey, 3600),
          }))
        );

        const scorerSnapshot = s.ratingTask.scorerSnapshot as string[];
        // Exclude SUPER_ADMIN from total
        const eligibleTotal = await db.user.count({
          where: { id: { in: scorerSnapshot }, role: { in: ["SCORER", "ADMIN"] } },
        });

        return {
          id: s.ratingTask.id,
          status: s.ratingTask.status,
          createdAt: s.ratingTask.createdAt,
          myScore: s.score,
          scoredAt: s.createdAt,
          finalScore: s.ratingTask.status === "COMPLETED"
            ? await db.ratingScore
                .aggregate({
                  where: { ratingTaskId: s.ratingTaskId },
                  _avg: { score: true },
                })
                .then((r) => r._avg.score)
            : null,
          progress: {
            scored: await db.ratingScore.count({ where: { ratingTaskId: s.ratingTaskId } }),
            total: eligibleTotal,
          },
          profile: s.ratingTask.ratedUser.profile
            ? {
                birthDate: s.ratingTask.ratedUser.profile.birthDate,
                heightCm: s.ratingTask.ratedUser.profile.heightCm,
                weightKg: s.ratingTask.ratedUser.profile.weightKg,
                attribute: s.ratingTask.ratedUser.profile.attribute,
                customAttribute: s.ratingTask.ratedUser.profile.customAttribute,
              }
            : null,
          photos: photosWithUrls,
        };
      })
    );

    return success({ tasks: enriched });
  }

  return error("VALIDATION_ERROR", "无效的 status 参数", 422);
}
