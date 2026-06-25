import { db } from "@/lib/db";
import { normalizeNicknameInput } from "@/lib/group-card";

export interface RankingEntry {
  rank: number;
  userId: string;
  nickname: string;
  appearanceScore: number;
  scoreCompletedAt: Date | null;
}

function displayNickname(rawNickname: string | null | undefined): string {
  const normalized = normalizeNicknameInput(rawNickname || "");
  return normalized || "未设置昵称";
}

export async function getTopRankingEntries(limit = 10): Promise<RankingEntry[]> {
  const rows = await db.ratingProfile.findMany({
    where: {
      ratingStatus: "COMPLETED",
      rankingOptIn: true,
      finalScore: { not: null },
      user: { status: "ACTIVE" },
    },
    orderBy: [
      { finalScore: "desc" },
      { scoreCompletedAt: "asc" },
      { updatedAt: "asc" },
    ],
    take: limit,
    select: {
      userId: true,
      finalScore: true,
      scoreCompletedAt: true,
      user: {
        select: {
          authIdentities: {
            orderBy: { createdAt: "desc" },
            select: { nickname: true },
            take: 1,
          },
        },
      },
    },
  });

  return rows.map((row, index) => ({
    rank: index + 1,
    userId: row.userId,
    nickname: displayNickname(row.user.authIdentities[0]?.nickname),
    appearanceScore: row.finalScore ?? 0,
    scoreCompletedAt: row.scoreCompletedAt,
  }));
}
