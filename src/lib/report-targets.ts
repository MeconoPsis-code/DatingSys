import { db } from "@/lib/db";

export interface ReportableTarget {
  targetQQ: string;
  nickname: string | null;
  approvedAt: Date | null;
}

export async function hasReportableContext(
  reporterId: string,
  targetId: string
): Promise<boolean> {
  const approvedRequest = await db.viewRequest.findFirst({
    where: {
      status: "APPROVED",
      OR: [
        { requesterId: reporterId, targetUserId: targetId },
        { requesterId: targetId, targetUserId: reporterId },
      ],
    },
    select: { id: true },
  });

  return Boolean(approvedRequest);
}

export async function listReportableTargets(
  reporterId: string
): Promise<ReportableTarget[]> {
  const approvedRequests = await db.viewRequest.findMany({
    where: {
      status: "APPROVED",
      OR: [{ requesterId: reporterId }, { targetUserId: reporterId }],
    },
    include: {
      requester: {
        select: {
          id: true,
          qqNumber: true,
          status: true,
          authIdentities: { select: { nickname: true }, take: 1 },
          profile: { select: { status: true } },
        },
      },
      target: {
        select: {
          id: true,
          qqNumber: true,
          status: true,
          authIdentities: { select: { nickname: true }, take: 1 },
          profile: { select: { status: true } },
        },
      },
    },
    orderBy: [{ respondedAt: "desc" }, { createdAt: "desc" }],
  });

  const targetById = new Map<
    string,
    {
      id: string;
      qqNumber: string | null;
      status: string;
      nickname: string | null;
      profileStatus: string | null;
      approvedAt: Date | null;
    }
  >();

  for (const request of approvedRequests) {
    const other =
      request.requesterId === reporterId ? request.target : request.requester;
    if (!other.qqNumber) continue;

    const approvedAt = request.respondedAt ?? request.updatedAt ?? request.createdAt;
    const existing = targetById.get(other.id);
    if (existing && existing.approvedAt && approvedAt <= existing.approvedAt) {
      continue;
    }

    targetById.set(other.id, {
      id: other.id,
      qqNumber: other.qqNumber,
      status: other.status,
      nickname: other.authIdentities[0]?.nickname ?? null,
      profileStatus: other.profile?.status ?? null,
      approvedAt,
    });
  }

  const targetIds = [...targetById.keys()];
  if (targetIds.length === 0) return [];

  const activeReports = await db.report.findMany({
    where: {
      reporterId,
      targetUserId: { in: targetIds },
      status: { in: ["PENDING", "REVIEWING"] },
    },
    select: { targetUserId: true },
  });

  const activeReportTargetIds = new Set(
    activeReports.map((report) => report.targetUserId)
  );

  return [...targetById.values()]
    .filter(
      (target) =>
        target.status === "ACTIVE" &&
        target.profileStatus === "ACTIVE" &&
        !activeReportTargetIds.has(target.id)
    )
    .sort((a, b) => {
      const aTime = a.approvedAt?.getTime() ?? 0;
      const bTime = b.approvedAt?.getTime() ?? 0;
      return bTime - aTime;
    })
    .map((target) => ({
      targetQQ: target.qqNumber!,
      nickname: target.nickname,
      approvedAt: target.approvedAt,
    }));
}
