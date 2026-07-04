import { success, error } from "@/lib/api-response";
import { getRankingDisplayLimit, getTopRankingEntries } from "@/lib/ranking";

export async function GET() {
  try {
    const maxRank = await getRankingDisplayLimit();
    const rankings = await getTopRankingEntries(maxRank);
    return success({ rankings, maxRank });
  } catch (err) {
    console.error("[ranking] GET error:", err);
    return error("INTERNAL_ERROR", "服务器内部错误", 500);
  }
}
