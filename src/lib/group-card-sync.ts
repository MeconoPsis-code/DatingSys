export type GroupCardSyncStatus = "pending" | "syncing" | "synced" | "failed" | "paused" | "not_applicable";
export type GroupCardSyncMode = "off" | "observe" | "active";

export interface GroupCardSyncGroup {
  workspaceId: string;
  workspaceName: string;
  groupId: string;
  desiredCard: string;
  observedCard: string | null;
  confirmedCard: string | null;
  lastVerifiedAt: string | null;
  status: GroupCardSyncStatus;
  reason: string | null;
}

export interface GroupCardSyncSummary {
  status: GroupCardSyncStatus | "partial";
  nicknameRevision: number;
  cardRevision: number;
  lastVerifiedAt: string | null;
  groups: GroupCardSyncGroup[];
}

export function groupCardSyncMode(value = process.env.GROUP_CARD_SYNC_MODE): GroupCardSyncMode {
  return value === "active" || value === "off" ? value : "observe";
}

export function aggregateGroupCardSyncStatus(groups: Pick<GroupCardSyncGroup, "status">[]): GroupCardSyncSummary["status"] {
  const participating = groups.filter((group) => group.status !== "not_applicable");
  if (!participating.length) return "not_applicable";
  if (participating.every((group) => group.status === "synced")) return "synced";
  if (participating.some((group) => group.status === "synced")) return "partial";
  if (participating.every((group) => group.status === "paused")) return "paused";
  if (participating.some((group) => group.status === "syncing")) return "syncing";
  if (participating.some((group) => group.status === "pending")) return "pending";
  return "failed";
}

export function groupCardRetryDelay(attempt: number, random = Math.random): number {
  const delays = [5_000, 30_000, 120_000, 600_000, 1_800_000];
  return Math.round(delays[Math.min(Math.max(attempt - 1, 0), delays.length - 1)] * (0.9 + random() * 0.2));
}

export function groupCardSyncReason(code: string | null, detail: string | null): string | null {
  const reasons: Record<string, string> = {
    PERMISSION: "机器人暂无修改群名片的权限，请联系群管理员后重新同步",
    permission_denied: "机器人暂无修改群名片的权限，请联系群管理员后重新同步",
    member_missing: "机器人暂时无法访问该群成员，请确认仍在群内后重新同步",
    timeout: "QQ 请求超时，后台会自动重试",
    bot_unavailable: "QQ 服务暂时不可用，后台会自动重试",
    readback_mismatch: "QQ 名片尚未读回目标值，后台会继续核实",
    READBACK_MISMATCH: "QQ 名片尚未读回目标值，后台会继续核实",
    observation_changed: "QQ 名片在同步期间发生变化，后台正在重新核实",
    NICKNAME_MISSING: "请先设置有效昵称",
    LEFT_GROUP: "已退出该群",
    WORKSPACE_PAUSED: "该群同步暂时停用",
  };
  return (code && reasons[code]) || detail;
}
