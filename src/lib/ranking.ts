import { db } from "@/lib/db";
import { normalizeNicknameInput } from "@/lib/group-card";
import type { ViewRequestStatus } from "@prisma/client";

export interface RankingEntry {
  rank: number;
  userId: string;
  nickname: string;
  appearanceScore: number;
  scoreCompletedAt: Date | null;
}

export type RankingProfileRequestStatus =
  | ViewRequestStatus
  | "PENDING_INCOMING"
  | "SELF";

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

function requestStatusPriority(status: RankingProfileRequestStatus): number {
  switch (status) {
    case "SELF":
      return 5;
    case "APPROVED":
      return 4;
    case "PENDING":
    case "PENDING_INCOMING":
      return 3;
    case "REJECTED":
      return 2;
    case "EXPIRED":
    case "CANCELLED":
      return 1;
  }
}

export async function getRankingProfileRequestStatuses(
  currentUserId: string | null | undefined,
  targetUserIds: string[]
): Promise<Record<string, RankingProfileRequestStatus>> {
  if (!currentUserId || targetUserIds.length === 0) return {};

  const uniqueTargetIds = [...new Set(targetUserIds)];
  const statusMap: Record<string, RankingProfileRequestStatus> = {};

  for (const targetUserId of uniqueTargetIds) {
    if (targetUserId === currentUserId) {
      statusMap[targetUserId] = "SELF";
    }
  }

  const requests = await db.viewRequest.findMany({
    where: {
      OR: [
        {
          requesterId: currentUserId,
          targetUserId: { in: uniqueTargetIds },
        },
        {
          requesterId: { in: uniqueTargetIds },
          targetUserId: currentUserId,
          status: { in: ["APPROVED", "PENDING"] },
        },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: {
      requesterId: true,
      targetUserId: true,
      status: true,
    },
  });

  for (const request of requests) {
    const targetUserId =
      request.requesterId === currentUserId
        ? request.targetUserId
        : request.requesterId;
    if (!uniqueTargetIds.includes(targetUserId)) continue;

    const requestStatus: RankingProfileRequestStatus =
      request.requesterId === currentUserId
        ? request.status
        : request.status === "PENDING"
          ? "PENDING_INCOMING"
          : request.status;
    const currentStatus = statusMap[targetUserId];
    if (
      !currentStatus ||
      requestStatusPriority(requestStatus) > requestStatusPriority(currentStatus)
    ) {
      statusMap[targetUserId] = requestStatus;
    }
  }

  return statusMap;
}
