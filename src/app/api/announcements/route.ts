import { db } from "@/lib/db";
import { error, success } from "@/lib/api-response";

// ── GET /api/announcements — published announcement posts ──

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const pageSize = Math.min(
      50,
      Math.max(1, parseInt(url.searchParams.get("pageSize") || "20", 10))
    );

    const where = { status: "PUBLISHED" as const };

    const [announcements, total] = await Promise.all([
      db.announcement.findMany({
        where,
        orderBy: [
          { pinned: "desc" },
          { publishedAt: "desc" },
          { createdAt: "desc" },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          author: {
            select: {
              qqNumber: true,
              authIdentities: { select: { nickname: true }, take: 1 },
            },
          },
        },
      }),
      db.announcement.count({ where }),
    ]);

    return success({
      announcements: announcements.map((item) => ({
        id: item.id,
        title: item.title,
        summary: item.summary,
        content: item.content,
        pinned: item.pinned,
        publishedAt: item.publishedAt,
        updatedAt: item.updatedAt,
        authorName: item.author?.authIdentities[0]?.nickname ?? item.author?.qqNumber ?? "TenMatch",
      })),
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (err) {
    console.error("[announcements] GET error:", err);
    if (err && typeof err === "object" && "status" in err) {
      const appErr = err as { code: string; message: string; status: number };
      return error(appErr.code, appErr.message, appErr.status);
    }
    return error("INTERNAL_ERROR", "服务器内部错误", 500);
  }
}
