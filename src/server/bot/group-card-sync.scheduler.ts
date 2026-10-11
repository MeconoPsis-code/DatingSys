import { groupCardSyncMode } from "@/lib/group-card-sync";
import { createLogger } from "@/lib/logger";
import { napcatClient } from "./clients/napcat.client";
import { createGroupCardSyncCoordinator } from "./group-card-sync.coordinator";
import { groupCardSyncRepository } from "./group-card-sync.service";

let schedulerStarted = false;

export function startGroupCardSyncScheduler(): void {
  if (schedulerStarted || groupCardSyncMode() === "off") return;
  schedulerStarted = true;
  const log = createLogger("bot:group-card-sync");
  const coordinator = createGroupCardSyncCoordinator({
    repository: groupCardSyncRepository,
    client: napcatClient,
    mode: groupCardSyncMode,
    log,
  });
  log.info({ mode: groupCardSyncMode() }, "Group card synchronization scheduler started");
  const initial = setTimeout(() => { void coordinator.tick(); }, 5_000);
  const interval = setInterval(() => { void coordinator.tick(); }, 5_000);
  initial.unref();
  interval.unref();
}
