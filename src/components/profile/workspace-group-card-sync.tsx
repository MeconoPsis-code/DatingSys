"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { readApiJson } from "@/lib/api-client";
import type { GroupCardSyncMode, GroupCardSyncStatus } from "@/lib/group-card-sync";
import { formatGroupCardVerifiedAt, GROUP_CARD_SYNC_LABELS, GROUP_CARD_PANEL_STYLE } from "./group-card-sync-status";
import { useGroupCardRefresh } from "./use-group-card-refresh";

interface WorkspaceSyncData {
  states: Array<{
    userId: string;
    nickname: string | null;
    qqNumber: string | null;
    desiredCard: string;
    observedCard: string | null;
    confirmedCard: string | null;
    status: GroupCardSyncStatus;
    reason: string | null;
    lastVerifiedAt: string | null;
    updatedAt: string;
  }>;
  metrics: {
    pendingCount: number;
    oldestPendingAt: string | null;
    lastReconciledAt: string | null;
    lastObservedAt?: string | null;
    mode?: GroupCardSyncMode;
    online?: boolean | null;
    blockedCount?: number;
    alerts: string[];
  };
}

export function WorkspaceGroupCardSync() {
  const [data, setData] = useState<WorkspaceSyncData | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const [differencesOnly, setDifferencesOnly] = useState(true);
  const requestRef = useRef<Promise<void> | null>(null);
  const mountedRef = useRef(false);

  const refresh = useCallback(() => {
    if (requestRef.current) return requestRef.current;
    const request = (async () => {
      try {
        const response = await fetch("/api/admin/group-card-sync", { cache: "no-store" });
        const result = await readApiJson<{ data: WorkspaceSyncData }>(response, "无法加载群名片同步状态");
        if (mountedRef.current) { setData(result.data); setError(""); }
      } catch (cause) {
        if (mountedRef.current) setError(cause instanceof Error ? cause.message : "无法加载群名片同步状态");
      } finally {
        requestRef.current = null;
      }
    })();
    requestRef.current = request;
    return request;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    return () => { mountedRef.current = false; };
  }, [refresh]);

  useGroupCardRefresh({
    enabled: data !== null,
    pending: Boolean(data?.states.some((row) => row.status === "pending" || row.status === "syncing")),
    cardRevision: undefined,
    refresh,
  });

  async function requestAction(action: "reconcile" | "retry", userId?: string) {
    setPending(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/group-card-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...(userId ? { userId } : {}) }),
      });
      const result = await readApiJson<{ data?: { queuedUsers?: number; failedUsers?: Array<{ userId: string; error: string }> } }>(response, "无法提交同步请求");
      setNotice(action === "reconcile" ? "已请求本群对账，等待后台读取 QQ 当前名片。" : "已请求重新同步，等待 QQ 读回确认。");
      await refresh();
      if (result.data?.failedUsers?.length) {
        setError(`${result.data.failedUsers.length} 位用户未能提交重试：${result.data.failedUsers[0].error}`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法提交同步请求");
    } finally { setPending(false); }
  }

  const rows = data?.states.filter((row) => !differencesOnly || (row.status !== "synced" && row.status !== "not_applicable")) ?? [];
  const modeDescription = data?.metrics.mode === "observe"
    ? "观察模式：只记录差异，不自动修改网站或 QQ。"
    : data?.metrics.mode === "off"
      ? "同步已关闭：保留待办，等待重新启用。"
      : data?.metrics.mode === "active"
        ? "自动同步已启用。"
        : null;

  return (
    <Card style={GROUP_CARD_PANEL_STYLE}>
      <CardHeader>
        <CardTitle>群名片同步</CardTitle>
        <CardDescription>查看本群差异、最后读回证据及失败原因。年龄和省份以网站资料为准，昵称双向同步。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={pending} onClick={() => void refresh()}>刷新状态</Button>
          <Button variant="outline" size="sm" disabled={pending} onClick={() => void requestAction("reconcile")}>请求对账</Button>
          <Button variant="outline" size="sm" disabled={pending} onClick={() => void requestAction("retry")}>重试未完成同步</Button>
        </div>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
        {data ? <>
          {modeDescription ? <p role="status" className="text-sm text-muted-foreground">{modeDescription}</p> : null}
          {data.metrics.online !== undefined ? <p className="text-sm text-muted-foreground">{data.metrics.online === true ? "机器人在线" : data.metrics.online === false ? "机器人离线，等待恢复后补偿同步。" : "机器人状态待检查"}</p> : null}
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div><dt className="text-muted-foreground">待同步人数</dt><dd>{data.metrics.pendingCount}</dd></div>
            <div><dt className="text-muted-foreground">最早等待时间</dt><dd>{data.metrics.oldestPendingAt ? formatGroupCardVerifiedAt(data.metrics.oldestPendingAt) : "无待办"}</dd></div>
            <div><dt className="text-muted-foreground">最近成功群对账</dt><dd>{data.metrics.lastReconciledAt ? formatGroupCardVerifiedAt(data.metrics.lastReconciledAt) : "尚无成功对账"}</dd></div>
            {data.metrics.lastObservedAt !== undefined ? <div><dt className="text-muted-foreground">最近名片观察</dt><dd>{formatGroupCardVerifiedAt(data.metrics.lastObservedAt)}</dd></div> : null}
            {data.metrics.blockedCount !== undefined ? <div><dt className="text-muted-foreground">暂停或阻塞人数</dt><dd>{data.metrics.blockedCount}</dd></div> : null}
          </dl>
          {data.metrics.alerts.length ? <ul aria-label="同步告警" className="flex flex-col gap-1 text-sm text-destructive">{data.metrics.alerts.map((alert) => <li key={alert}>{alert}</li>)}</ul> : null}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={differencesOnly} onChange={(event) => setDifferencesOnly(event.target.checked)} />仅显示未完成同步</label>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[660px] text-left text-sm">
              <caption className="sr-only">本工作空间的群名片同步状态</caption>
              <thead><tr className="border-b text-muted-foreground"><th className="py-2">用户</th><th>网站期望名片</th><th>QQ 最后确认名片</th><th>同步状态</th><th>操作</th></tr></thead>
              <tbody>{rows.map((row) => <tr key={row.userId} className="border-b align-top last:border-0">
                <td className="py-3 pr-3"><p>{row.nickname || row.userId}</p><p className="text-xs text-muted-foreground">{row.qqNumber || "未绑定 QQ"}</p></td>
                <td className="max-w-[200px] break-words py-3 pr-3">{row.desiredCard}</td>
                <td className="max-w-[220px] break-words py-3 pr-3"><p>{row.confirmedCard ?? "尚未确认"}</p><p className="text-xs text-muted-foreground">{formatGroupCardVerifiedAt(row.lastVerifiedAt)}</p>{row.observedCard !== null && row.observedCard !== row.confirmedCard ? <p className="mt-1 text-xs text-muted-foreground">最近观察：{row.observedCard || "空名片"}</p> : null}</td>
                <td className="max-w-[240px] break-words py-3 pr-3"><p>{GROUP_CARD_SYNC_LABELS[row.status]}</p>{row.reason ? <p className="mt-1 text-xs text-destructive">{row.reason}</p> : null}</td>
                <td className="py-2"><Button variant="ghost" size="sm" disabled={pending || row.status === "not_applicable"} onClick={() => void requestAction("retry", row.userId)}>重新同步</Button></td>
              </tr>)}</tbody>
            </table>
            {!rows.length ? <p className="py-4 text-sm text-muted-foreground">{differencesOnly ? "没有未完成的同步。" : "尚无群名片同步记录。"}</p> : null}
          </div>
        </> : !error ? <p className="text-sm text-muted-foreground">正在加载同步状态…</p> : null}
      </CardContent>
    </Card>
  );
}
