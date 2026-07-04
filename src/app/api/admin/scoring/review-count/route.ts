import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { error, success } from "@/lib/api-response";

export async function GET() {
  try {
    await requireRole("SUPER_ADMIN");

    const total = await db.ratingTask.count({
      where: { status: { in: ["REVIEW", "REPORTED"] } },
    });

    return success({ total });
  } catch (err) {
    console.error("[admin/scoring/review-count] GET error:", err);
    if (err && typeof err === "object" && "status" in err) {
      const appErr = err as { code: string; message: string; status: number };
      return error(appErr.code, appErr.message, appErr.status);
    }
    return error("INTERNAL_ERROR", "服务器内部错误", 500);
  }
}
