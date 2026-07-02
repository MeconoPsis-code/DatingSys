import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { success, error } from "@/lib/api-response";
import { deleteUsersPermanently } from "@/lib/admin-user-delete";

const MAX_BATCH_DELETE_USERS = 50;

function parseUserIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole("SUPER_ADMIN");
    const body = await req.json().catch(() => null);
    const userIds = parseUserIds((body as { userIds?: unknown } | null)?.userIds);

    if (userIds.length === 0) {
      return error("VALIDATION_ERROR", "请选择要删除的用户", 422);
    }

    if (userIds.length > MAX_BATCH_DELETE_USERS) {
      return error(
        "VALIDATION_ERROR",
        `单次批量删除最多${MAX_BATCH_DELETE_USERS}个用户`,
        422,
      );
    }

    if (userIds.includes(session.id)) {
      return error("FORBIDDEN", "不能删除自己的账号", 403);
    }

    const existingUsers = await db.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true },
    });
    if (existingUsers.length !== userIds.length) {
      return error("NOT_FOUND", "部分用户不存在，请刷新后重试", 404);
    }

    const result = await deleteUsersPermanently({
      actorId: session.id,
      userIds,
      auditAction: "ADMIN_BATCH_DELETE_USER",
      auditMetadata: { mode: "batch_delete" },
    });

    return success({
      message: "用户已删除",
      deletedCount: result.deletedCount,
      deletedFiles: result.deletedFileKeys.length - result.failedFileDeletes.length,
      failedFileDeletes: result.failedFileDeletes.length,
    });
  } catch (err) {
    console.error("[admin/users/batch-delete] POST error:", err);
    if (err && typeof err === "object" && "status" in err) {
      const appErr = err as { code: string; message: string; status: number };
      return error(appErr.code, appErr.message, appErr.status);
    }
    return error("INTERNAL_ERROR", "服务器内部错误", 500);
  }
}
