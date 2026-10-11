import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { apiHandler } from "@/lib/api-handler";
import { getGroupCardSyncView, retryGroupCardSync } from "@/server/bot/group-card-sync.service";

export const GET = apiHandler(async () => {
  const session = await requireAuth();
  return NextResponse.json({ data: await getGroupCardSyncView(session.id) }, {
    headers: { "Cache-Control": "no-store" },
  });
});

/** Requeue the current target even when the nickname has not changed. */
export const POST = apiHandler(async (req) => {
  const session = await requireAuth();
  const rawBody = await req.text();
  let body: { workspaceId?: unknown } = {};
  if (rawBody.trim()) {
    try {
      const parsed: unknown = JSON.parse(rawBody);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid request body");
      body = parsed;
    } catch {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "请求体无效" } }, { status: 422 });
    }
  }
  if (body.workspaceId !== undefined && (typeof body.workspaceId !== "string" || !body.workspaceId.trim())) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "工作空间标识无效" } }, { status: 422 });
  }
  const groupCardSync = await retryGroupCardSync(session.id, typeof body.workspaceId === "string" ? body.workspaceId.trim() : undefined);
  return NextResponse.json({ data: { groupCardSync, message: "已重新安排 QQ 群名片同步" } }, { status: 202 });
});
