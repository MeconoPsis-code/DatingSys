import { success, error } from "@/lib/api-response";
import { getTopRankingEntries } from "@/lib/ranking";

export async function GET() {
  try {
    const rankings = await getTopRankingEntries(10);
    return success({ rankings });
  } catch (err) {
    console.error("[ranking] GET error:", err);
    return error("INTERNAL_ERROR", "服务器内部错误", 500);
  }
}
