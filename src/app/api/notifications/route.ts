import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { success, error } from "@/lib/api-response";

/**
 * GET /api/notifications
 * List notifications for the current user, with unread count.
 */
export async function GET(req: Request) {
  const session = await requireAuth();

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const pageSize = Math.min(
    50,
    Math.max(1, parseInt(url.searchParams.get("pageSize") || "20", 10))
  );

  const [notifications, total, unreadCount] = await Promise.all([
    db.notification.findMany({
      where: { userId: session.id },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.notification.count({ where: { userId: session.id } }),
    db.notification.count({ where: { userId: session.id, isRead: false } }),
  ]);

  return success({
    notifications,
    unreadCount,
    pagination: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  });
}

/**
 * PUT /api/notifications
 * Mark notification(s) as read.
 * Body: { ids: string[] } or { markAllRead: true }
 */
export async function PUT(req: Request) {
  const session = await requireAuth();

  let body;
  try {
    body = await req.json();
  } catch {
    return error("VALIDATION_ERROR", "无效的请求体", 422);
  }

  if (body.markAllRead) {
    await db.notification.updateMany({
      where: { userId: session.id, isRead: false },
      data: { isRead: true },
    });
    return success({ marked: "all" });
  }

  if (Array.isArray(body.ids) && body.ids.length > 0) {
    await db.notification.updateMany({
      where: {
        id: { in: body.ids },
        userId: session.id, // security: only own notifications
      },
      data: { isRead: true },
    });
    return success({ marked: body.ids.length });
  }

  return error("VALIDATION_ERROR", "请提供 ids 或 markAllRead", 422);
}
