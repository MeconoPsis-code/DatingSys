"use client";

import { useState, type CSSProperties } from "react";
import type { GroupCardSyncSummary } from "@/lib/group-card-sync";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

type GroupCardSyncStatus = GroupCardSyncSummary["status"];

// Existing theme variables contain HSL channels; support them without changing the shared Card.
export const GROUP_CARD_PANEL_STYLE = {
  backgroundColor: "hsl(var(--card))",
  color: "hsl(var(--card-foreground))",
  "--tw-ring-color": "hsl(var(--border))",
} as CSSProperties;

export const GROUP_CARD_SYNC_LABELS: Record<GroupCardSyncStatus, string> = {
  pending: "等待同步",
  syncing: "正在同步",
  synced: "已同步并确认",
  failed: "同步失败",
  paused: "同步已暂停",
  not_applicable: "暂无参与群",
  partial: "部分群已同步",
};

export function hasPendingGroupCardSync(summary: GroupCardSyncSummary | undefined): boolean {
  // Failed deliveries remain durable retry work. Paused groups need an external
  // change; all automatic polling remains bounded by the two-minute window.
  return Boolean(summary?.groups.some((group) => group.status === "pending" || group.status === "syncing" || group.status === "failed"));
}

export function formatGroupCardVerifiedAt(value: string | null): string {
  if (!value) return "尚未确认";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "尚未确认";
  return date.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function statusClass(status: GroupCardSyncStatus): string {
  if (status === "synced") return "text-emerald-600";
  if (status === "failed") return "text-red-600";
  if (status === "paused") return "text-amber-600";
  return "text-brand-blue";
}

export function GroupCardSyncStatusCard({
  summary,
  desiredCard,
  onRetry,
}: {
  summary: GroupCardSyncSummary | undefined;
  desiredCard: string;
  onRetry: (workspaceId?: string) => Promise<void>;
}) {
  const [retrying, setRetrying] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  async function retry() {
    setRetrying(true);
    setMessage(null);
    try {
      await onRetry();
      setMessage({ text: "已请求重新同步，请等待 QQ 读回确认。", ok: true });
    } catch (cause) {
      setMessage({ text: cause instanceof Error ? cause.message : "重新同步失败，请稍后重试。", ok: false });
    } finally {
      setRetrying(false);
    }
  }

  return (
    <Card role="region" aria-labelledby="group-card-sync-heading" style={GROUP_CARD_PANEL_STYLE}>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle id="group-card-sync-heading">群名片同步</CardTitle>
        <span role="status" className={`text-xs font-medium ${summary ? statusClass(summary.status) : "text-[hsl(var(--muted-foreground))]"}`}>
          {summary ? GROUP_CARD_SYNC_LABELS[summary.status] : "同步状态暂不可用"}
        </span>
        </div>
        <CardDescription style={{ color: "hsl(var(--muted-foreground))" }}>年龄和省份取自网站资料；昵称可在网站或 QQ 修改，并同步到参与的群。</CardDescription>
      </CardHeader>
      <CardContent>
      <dl className="text-sm">
        <dt className="text-xs text-[hsl(var(--muted-foreground))]">网站期望名片</dt>
        <dd className="mt-1 break-words font-medium text-[hsl(var(--foreground))]">{desiredCard || "未设置"}</dd>
      </dl>
      {summary?.groups.length ? (
        <ul className="mt-4 flex flex-col gap-3">
          {summary.groups.map((group) => (
            <li key={`${group.workspaceId}:${group.groupId}`} className="rounded-lg bg-[hsl(var(--secondary))] p-3">
              <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
                <span className="min-w-0 break-words font-medium text-[hsl(var(--foreground))]">{group.workspaceName || group.groupId}</span>
                <span className={statusClass(group.status)}>{GROUP_CARD_SYNC_LABELS[group.status]}</span>
              </div>
              <dl className="mt-2 text-xs">
                <dt className="text-[hsl(var(--muted-foreground))]">QQ 最后确认名片</dt>
                <dd className="mt-0.5 break-words text-sm text-[hsl(var(--foreground))]">{group.confirmedCard ?? "尚未确认"}</dd>
              </dl>
              <p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">确认时间：{formatGroupCardVerifiedAt(group.lastVerifiedAt)}（上海时间）</p>
              {group.observedCard !== null && group.observedCard !== group.confirmedCard ? <p className="mt-1 break-words text-xs text-[hsl(var(--muted-foreground))]">最近观察：{group.observedCard || "空名片"}</p> : null}
              {group.reason ? <p className={`mt-2 break-words text-xs ${group.status === "failed" ? "text-red-600" : "text-amber-600"}`}>{group.reason}</p> : null}
            </li>
          ))}
        </ul>
      ) : <p className="mt-3 text-xs text-[hsl(var(--muted-foreground))]">{summary ? "加入已接入的 QQ 群后会自动同步。" : "网站昵称已保存；刷新页面后可查看 QQ 同步结果。"}</p>}
      {message && !(message.ok && summary?.status === "synced") ? <p role={message.ok ? "status" : "alert"} className={`mt-2 text-xs ${message.ok ? "text-emerald-600" : "text-red-600"}`}>{message.text}</p> : null}
      </CardContent>
      {summary?.groups.length ? <CardFooter><Button type="button" variant="outline" size="sm" onClick={() => void retry()} disabled={retrying}>{retrying ? "正在提交…" : "重新同步"}</Button></CardFooter> : null}
    </Card>
  );
}
