import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { error, success } from "@/lib/api-response";
import { parseAnnouncementInput, publishedAtForStatus } from "@/lib/announcements";

// ── PUT /api/admin/announcements/:id — update announcement ──

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole("ADMIN");
    const { id } = await params;

    const existing = await db.announcement.findUnique({ where: { id } });
    if (!existing) {
      return error("NOT_FOUND", "公告不存在", 404);
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return error("VALIDATION_ERROR", "无效的请求体", 422);
    }

    const parsed = parseAnnouncementInput(body, { partial: true });
    if (parsed.error) {
      return error(parsed.error.code, parsed.error.message, parsed.error.status);
    }

    const input = parsed.data!;
    const announcement = await db.announcement.update({
      where: { id },
      data: {
        ...("title" in input ? { title: input.title } : {}),
        ...("summary" in input ? { summary: input.summary } : {}),
        ...("content" in input ? { content: input.content } : {}),
        ...("pinned" in input ? { pinned: input.pinned } : {}),
        ...("status" in input
          ? {
              status: input.status,
              publishedAt: publishedAtForStatus(input.status, existing.publishedAt),
            }
          : {}),
      },
    });

    await db.auditLog.create({
      data: {
        actorUserId: session.id,
        action: "ANNOUNCEMENT_UPDATE",
        targetType: "Announcement",
        targetId: id,
        metadata: {
          oldStatus: existing.status,
          newStatus: announcement.status,
          pinned: announcement.pinned,
        },
      },
    });

    return success({ announcement });
  } catch (err) {
    console.error("[admin/announcements/:id] PUT error:", err);
    if (err && typeof err === "object" && "status" in err) {
      const appErr = err as { code: string; message: string; status: number };
      return error(appErr.code, appErr.message, appErr.status);
    }
    return error("INTERNAL_ERROR", "服务器内部错误", 500);
  }
}

// ── DELETE /api/admin/announcements/:id — delete announcement ──

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole("ADMIN");
    const { id } = await params;

    const existing = await db.announcement.findUnique({ where: { id } });
    if (!existing) {
      return error("NOT_FOUND", "公告不存在", 404);
    }

    await db.announcement.delete({ where: { id } });

    await db.auditLog.create({
      data: {
        actorUserId: session.id,
        action: "ANNOUNCEMENT_DELETE",
        targetType: "Announcement",
        targetId: id,
        metadata: {
          title: existing.title,
          status: existing.status,
        },
      },
    });

    return success({ message: "公告已删除" });
  } catch (err) {
    console.error("[admin/announcements/:id] DELETE error:", err);
    if (err && typeof err === "object" && "status" in err) {
      const appErr = err as { code: string; message: string; status: number };
      return error(appErr.code, appErr.message, appErr.status);
    }
    return error("INTERNAL_ERROR", "服务器内部错误", 500);
  }
}
