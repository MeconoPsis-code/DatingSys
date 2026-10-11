import { db } from "@/lib/db";
import type { Workspace } from "@prisma/client";

/** Group-card delivery only uses active, unexpired connected groups. */
export function isWorkspaceOperational(
  workspace: Pick<Workspace, "status" | "expiresAt">,
  now: Date = new Date(),
): boolean {
  return workspace.status === "ACTIVE" && (!workspace.expiresAt || workspace.expiresAt > now);
}

export async function workspaceForGroup(groupId: string) {
  const found = await db.workspace.findUnique({ where: { qqGroupId: groupId } });
  if (found) return found;
  // Fresh installations may have no historical group row for the migration to infer.
  if (groupId && groupId === process.env.BOT_TARGET_GROUP_ID) {
    const updated = await db.workspace.updateMany({
      where: { slug: "official", qqGroupId: "default" },
      data: { qqGroupId: groupId },
    });
    if (updated.count > 0) return db.workspace.findUnique({ where: { qqGroupId: groupId } });
  }
  return null;
}
