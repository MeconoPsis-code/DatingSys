import { Prisma } from "@prisma/client";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { error, success } from "@/lib/api-response";
import {
  DUTY_WEEKDAYS,
  getChinaDutyWeekday,
  normalizeDutyWeekdays,
} from "@/lib/scorer-duty";

interface ScheduleInput {
  scorerId?: unknown;
  weekdays?: unknown;
}

async function replaceSchedule(scorerId: string, weekdays: number[]) {
  return db.$transaction([
    db.scorerDutySchedule.deleteMany({ where: { scorerUserId: scorerId } }),
    db.scorerDutySchedule.createMany({
      data: weekdays.map((weekday) => ({
        scorerUserId: scorerId,
        weekday,
      })),
    }),
  ]);
}

export async function GET() {
  try {
    await requireRole("SUPER_ADMIN");

    const scorers = await db.user.findMany({
      where: {
        role: { in: ["SCORER", "ADMIN"] },
        status: "ACTIVE",
      },
      include: {
        authIdentities: { select: { nickname: true }, take: 1 },
        dutySchedules: {
          select: { weekday: true },
          orderBy: { weekday: "asc" },
        },
      },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    });

    return success({
      weekdays: DUTY_WEEKDAYS,
      today: getChinaDutyWeekday(),
      scorers: scorers.map((scorer) => ({
        id: scorer.id,
        qqNumber: scorer.qqNumber,
        role: scorer.role,
        nickname: scorer.authIdentities[0]?.nickname ?? null,
        weekdays: scorer.dutySchedules.map((schedule) => schedule.weekday),
      })),
    });
  } catch (err) {
    console.error("[admin/scorer-schedule] GET error:", err);
    if (err && typeof err === "object" && "status" in err) {
      const appErr = err as { code: string; message: string; status: number };
      return error(appErr.code, appErr.message, appErr.status);
    }
    return error("INTERNAL_ERROR", "服务器内部错误", 500);
  }
}

export async function PUT(req: Request) {
  try {
    const session = await requireRole("SUPER_ADMIN");

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return error("VALIDATION_ERROR", "无效的请求体", 422);
    }

    const bodyRecord = body as {
      scorerId?: unknown;
      weekdays?: unknown;
      schedules?: unknown;
    };

    const schedulesInput: ScheduleInput[] = Array.isArray(bodyRecord.schedules)
      ? (bodyRecord.schedules as ScheduleInput[])
      : [{ scorerId: bodyRecord.scorerId, weekdays: bodyRecord.weekdays }];

    if (schedulesInput.length === 0) {
      return error("VALIDATION_ERROR", "请提供排班信息", 422);
    }

    const normalized = schedulesInput.map((item) => ({
      scorerId: typeof item.scorerId === "string" ? item.scorerId : "",
      weekdays: normalizeDutyWeekdays(item.weekdays),
    }));

    if (normalized.some((item) => !item.scorerId)) {
      return error("VALIDATION_ERROR", "评分员信息不完整", 422);
    }

    const scorerIds = Array.from(new Set(normalized.map((item) => item.scorerId)));
    const eligibleScorers = await db.user.findMany({
      where: {
        id: { in: scorerIds },
        role: { in: ["SCORER", "ADMIN"] },
        status: "ACTIVE",
      },
      select: { id: true },
    });
    const eligibleIds = new Set(eligibleScorers.map((scorer) => scorer.id));
    const invalidScorer = scorerIds.find((id) => !eligibleIds.has(id));

    if (invalidScorer) {
      return error("VALIDATION_ERROR", "只能为活跃评分员或管理员排班", 422);
    }

    for (const item of normalized) {
      await replaceSchedule(item.scorerId, item.weekdays);
    }

    await db.auditLog.create({
      data: {
        actorUserId: session.id,
        action: "SCORER_DUTY_SCHEDULE_UPDATE",
        targetType: "ScorerDutySchedule",
        metadata: {
          schedules: normalized,
        } as Prisma.InputJsonValue,
      },
    });

    return success({
      message: "排班已保存",
      schedules: normalized,
    });
  } catch (err) {
    console.error("[admin/scorer-schedule] PUT error:", err);
    if (err && typeof err === "object" && "status" in err) {
      const appErr = err as { code: string; message: string; status: number };
      return error(appErr.code, appErr.message, appErr.status);
    }
    return error("INTERNAL_ERROR", "服务器内部错误", 500);
  }
}
