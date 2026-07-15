import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { success, error } from "@/lib/api-response";
import { NextRequest } from "next/server";
import { can } from "@/lib/rbac";
import { getChinaDutyWeekday, getOnDutyScorerIds } from "@/lib/scorer-duty";
import {
  formatChinaDateTime,
  getAssignedScorerIdsForTask,
  getRatingTaskTimeline,
  SCOREABLE_TASK_STATUSES,
} from "@/lib/scoring";
import { isPhotoReportReason } from "@/lib/photo-report-reasons";
import {
  lockRatingUserTasks,
  syncRatingProfileFromTasks,
} from "@/lib/rating-profile-sync";
import { isValidRatingTaskRevision } from "@/lib/rating-task-revision";

/**
 * POST /api/scoring/tasks/[taskId]/report
 * Scorer reports abnormal photos for a rating task.
 * Body: { reason: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const session = await requireAuth();
    if (!can(session.role, "SCORE_PHOTO")) {
      return error("FORBIDDEN", "无权操作此任务", 403);
    }
    const { taskId } = await params;
    const body = await req.json();
    const reason = (body.reason as string)?.trim();
    const taskRevision = body.taskRevision;

    if (!reason || !isPhotoReportReason(reason)) {
      return error("INVALID_REASON", "请选择有效的举报原因", 400);
    }
    if (!isValidRatingTaskRevision(taskRevision)) {
      return error("INVALID_TASK_VERSION", "无效的评分任务版本", 422);
    }

    const task = await db.ratingTask.findUnique({ where: { id: taskId } });
    if (!task) {
      return error("NOT_FOUND", "任务不存在", 404);
    }
    if (task.revision !== taskRevision) {
      return error("CONFLICT", "照片任务已更新，请刷新后重试", 409);
    }

    if (
      !SCOREABLE_TASK_STATUSES.includes(
        task.status as (typeof SCOREABLE_TASK_STATUSES)[number]
      )
    ) {
      return error("CONFLICT", "该任务当前不可举报", 409);
    }

    const now = new Date();
    const timeline = getRatingTaskTimeline(task, now);
    if (!timeline.isReleasedForScoring) {
      const message =
        now.getTime() < timeline.publishAt.getTime()
          ? `该任务将于 ${formatChinaDateTime(timeline.publishAt)} 发布给评分员`
          : "该任务已过当日 24:00 评分截止时间";
      return error("SCORING_WINDOW_CLOSED", message, 409);
    }

    const onDutyScorerIds = await getOnDutyScorerIds({
      weekday: getChinaDutyWeekday(timeline.publishAt),
    });
    const assignedScorerIds = getAssignedScorerIdsForTask({
      status: task.status,
      ratedUserId: task.ratedUserId,
      scorerSnapshot: task.scorerSnapshot,
      onDutyScorerIds,
    });
    if (!assignedScorerIds.includes(session.id)) {
      return error("FORBIDDEN", "无权操作此任务", 403);
    }

    // Check for duplicate report
    const existing = (task.photoReports as Array<{ reporterId: string }>) || [];
    if (existing.some((r) => r.reporterId === session.id)) {
      return error("ALREADY_REPORTED", "你已经举报过此任务的照片", 400);
    }

    // Add report
    const newReport = {
      reporterId: session.id,
      reason,
      createdAt: new Date().toISOString(),
    };

    const reportResult = await db.$transaction(async (tx) => {
      await lockRatingUserTasks(tx, task.ratedUserId);
      const currentTask = await tx.ratingTask.findUnique({
        where: { id: taskId },
        select: { status: true, revision: true, photoReports: true },
      });
      if (
        !currentTask ||
        currentTask.revision !== taskRevision ||
        !SCOREABLE_TASK_STATUSES.includes(
          currentTask.status as (typeof SCOREABLE_TASK_STATUSES)[number]
        )
      ) {
        return { error: "STALE_TASK" as const };
      }

      const currentReports =
        (currentTask.photoReports as Array<{ reporterId: string }>) || [];
      if (currentReports.some((report) => report.reporterId === session.id)) {
        return { error: "ALREADY_REPORTED" as const };
      }

      await tx.ratingTask.update({
        where: { id: taskId },
        data: {
          photoReports: [...currentReports, newReport],
          scorerSnapshot: assignedScorerIds,
          status: "REPORTED",
        },
      });
      await syncRatingProfileFromTasks(tx, task.ratedUserId);
      return { error: null };
    });
    if (reportResult.error === "ALREADY_REPORTED") {
      return error("ALREADY_REPORTED", "你已经举报过此任务的照片", 400);
    }
    if (reportResult.error === "STALE_TASK") {
      return error("CONFLICT", "评分任务已更新，请刷新后重试", 409);
    }

    return success({ message: "举报已提交，管理员将会审核" });
  } catch (err) {
    console.error("[scoring/report] error:", err);
    if (err && typeof err === "object" && "status" in err) {
      const appErr = err as { code: string; message: string; status: number };
      return error(appErr.code, appErr.message, appErr.status);
    }
    return error("INTERNAL_ERROR", "服务器内部错误", 500);
  }
}
