"use client";

import { WorkspaceGroupCardSync } from "@/components/profile/workspace-group-card-sync";

export default function GroupCardSyncPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <header>
        <h1 className="text-2xl font-bold text-brand-text">群名片同步</h1>
        <p className="mt-1 text-sm text-brand-muted">查看官方群名片同步结果，并请求对账或重试。</p>
      </header>
      <WorkspaceGroupCardSync />
    </div>
  );
}
