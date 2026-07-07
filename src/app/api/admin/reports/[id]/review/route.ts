import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { success, error } from "@/lib/api-response";

// POST /api/admin/reports/:id/review
// Mark a pending report as being reviewed by an admin.

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole("ADMIN");
    const { id } = await params;

    const report = await db.report.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!report) {
      return error("NOT_FOUND", "举报不存在", 404);
    }

    if (report.status === "REVIEWING") {
      return success({ status: "REVIEWING" });
    }

    if (report.status !== "PENDING") {
      return error("ALREADY_RESOLVED", "该举报已被处理", 400);
    }

    await db.$transaction([
      db.report.update({
        where: { id },
        data: {
          status: "REVIEWING",
          handledBy: session.id,
        },
      }),
      db.auditLog.create({
        data: {
          actorUserId: session.id,
          action: "REPORT_REVIEW_START",
          targetType: "Report",
          targetId: id,
          metadata: {},
        },
      }),
    ]);

    return success({ status: "REVIEWING" });
  } catch (err) {
    console.error("[admin/reports/:id/review] POST error:", err);
    if (err && typeof err === "object" && "status" in err) {
      const appErr = err as { code: string; message: string; status: number };
      return error(appErr.code, appErr.message, appErr.status);
    }
    return error("INTERNAL_ERROR", "服务器内部错误", 500);
  }
}
