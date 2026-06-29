import { requireAuth } from "@/lib/auth";
import { success, error } from "@/lib/api-response";
import { listReportableTargets } from "@/lib/report-targets";

export async function GET() {
  try {
    const session = await requireAuth();
    const targets = await listReportableTargets(session.id);
    return success(targets);
  } catch (err) {
    console.error("[reports/targets] GET error:", err);
    if (err && typeof err === "object" && "status" in err) {
      const appErr = err as { code: string; message: string; status: number };
      return error(appErr.code, appErr.message, appErr.status);
    }
    return error("INTERNAL_ERROR", "服务器内部错误", 500);
  }
}
