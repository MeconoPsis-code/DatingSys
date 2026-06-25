import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { error, success } from "@/lib/api-response";
import {
  ANNOUNCEMENT_STATUSES,
  parseAnnouncementInput,
  publishedAtForStatus,
  type AnnouncementStatusValue,
} from "@/lib/announcements";

// ── GET /api/admin/announcements — admin announcement list ──

export async function GET(req: Request) {
  try {
    await requireRole("ADMIN");

    const url = new URL(req.url);
    const status = url.searchParams.get("status") || undefined;
    if (status && !ANNOUNCEMENT_STATUSES.includes(status as AnnouncementStatusValue)) {
      return error("VALIDATION_ERROR", "公告状态无效", 422);
    }

    const where = status ? { status: status as AnnouncementStatusValue } : {};

    const announcements = await db.announcement.findMany({
      where,
      orderBy: [
        { pinned: "desc" },
        { publishedAt: "desc" },
        { updatedAt: "desc" },
      ],
      include: {
        author: {
          select: {
            qqNumber: true,
            authIdentities: { select: { nickname: true }, take: 1 },
          },
        },
      },
    });

    return success({
      announcements: announcements.map((item) => ({
        id: item.id,
        title: item.title,
        summary: item.summary,
        content: item.content,
        status: item.status,
        pinned: item.pinned,
        publishedAt: item.publishedAt,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        authorName: item.author?.authIdentities[0]?.nickname ?? item.author?.qqNumber ?? "—",
      })),
    });
  } catch (err) {
    console.error("[admin/announcements] GET error:", err);
    if (err && typeof err === "object" && "status" in err) {
      const appErr = err as { code: string; message: string; status: number };
      return error(appErr.code, appErr.message, appErr.status);
    }
    return error("INTERNAL_ERROR", "服务器内部错误", 500);
  }
}

// ── POST /api/admin/announcements — create announcement ──

export async function POST(req: Request) {
  try {
    const session = await requireRole("ADMIN");

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return error("VALIDATION_ERROR", "无效的请求体", 422);
    }

    const parsed = parseAnnouncementInput(body);
    if (parsed.error) {
      return error(parsed.error.code, parsed.error.message, parsed.error.status);
    }

    const input = parsed.data!;
    const announcement = await db.announcement.create({
      data: {
        title: input.title!,
        summary: input.summary ?? null,
        content: input.content!,
        status: input.status!,
        pinned: input.pinned ?? false,
        publishedAt: publishedAtForStatus(input.status),
        authorId: session.id,
      },
    });

    await db.auditLog.create({
      data: {
        actorUserId: session.id,
        action: "ANNOUNCEMENT_CREATE",
        targetType: "Announcement",
        targetId: announcement.id,
        metadata: {
          status: announcement.status,
          pinned: announcement.pinned,
        },
      },
    });

    return success({ announcement }, 201);
  } catch (err) {
    console.error("[admin/announcements] POST error:", err);
    if (err && typeof err === "object" && "status" in err) {
      const appErr = err as { code: string; message: string; status: number };
      return error(appErr.code, appErr.message, appErr.status);
    }
    return error("INTERNAL_ERROR", "服务器内部错误", 500);
  }
}
