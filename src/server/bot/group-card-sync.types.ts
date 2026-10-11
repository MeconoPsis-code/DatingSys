import type { GroupCardSyncMode, GroupCardSyncStatus } from "@/lib/group-card-sync";
import type { QQBotClient } from "./clients/qqbot-client.interface";

export interface SyncGroupSnapshot {
  id: string;
  groupId: string;
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  joinedAt: Date;
  operational: boolean;
  desiredCard: string;
  desiredCardRevision: number;
  status: GroupCardSyncStatus;
  observedCard: string | null;
  observedSeq?: number;
  observedAt?: Date | null;
  resolvedObservedCard: string | null;
  resolvedObservationSeq: number;
  resolvedAt?: Date | null;
  confirmedCard: string | null;
  confirmedRevision: number | null;
  syncedAt: Date | null;
  attemptCount: number;
  nextAttemptAt: Date | null;
  lastErrorCode: string | null;
}
export interface SyncInboxSnapshot {
  id: string;
  groupId: string;
  cardNew: string;
  cardOld: string;
  occurredAt: Date | null;
  receivedAt: Date;
}
export interface SyncAttemptSnapshot {
  id: string;
  groupId: string;
  cardRevision: number;
  targetCard: string;
  fromObservedCard: string | null;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
}
export interface SyncUserSnapshot {
  userId: string;
  qqNumber: string;
  nickname: string;
  sourceWorkspaceId: string | null;
  nicknameRevision: number;
  nicknameChangedAt: Date | null;
  cardRevision: number;
  initializedAt: Date | null;
  groups: SyncGroupSnapshot[];
  inbox: SyncInboxSnapshot[];
  attempts: SyncAttemptSnapshot[];
}
export interface SyncObservation {
  groupId: string;
  card: string;
  observedAt: Date;
  inboxIds?: string[];
  outcome?: string;
}
export interface SyncDecision {
  nickname?: string;
  sourceGroupId?: string;
  source?: string;
  observations: SyncObservation[];
  inboxOutcomes?: Array<{ id: string; outcome: string }>;
}
export interface SyncFinishAttempt {
  userId: string;
  token: string;
  groupId: string;
  cardRevision: number;
  attemptId: string;
  status: "confirmed" | "failed" | "unknown" | "superseded";
  observedCard?: string;
  now: Date;
  errorCode?: string;
  error?: string;
  nextAttemptAt?: Date;
}
export interface GroupCardSyncRepository {
  recordHealth?(online: boolean, now: Date, error?: string): Promise<void>;
  listDueUsers(now: Date, limit: number): Promise<string[]>;
  claimLease(userId: string, token: string, now: Date, until: Date): Promise<boolean>;
  renewLease(userId: string, token: string, now: Date, until: Date): Promise<boolean>;
  releaseLease(userId: string, token: string, now: Date): Promise<void>;
  loadSnapshot(userId: string, token: string, now: Date): Promise<SyncUserSnapshot | null>;
  acceptDecision(userId: string, token: string, expectedCardRevision: number, decision: SyncDecision, now: Date, mode: GroupCardSyncMode): Promise<SyncUserSnapshot | null>;
  prepareAttempt(userId: string, token: string, groupId: string, cardRevision: number, beforeCard: string, now: Date): Promise<{ id: string } | null>;
  finishAttempt(input: SyncFinishAttempt): Promise<boolean>;
  failGroup(userId: string, token: string, groupId: string, cardRevision: number, errorCode: string, error: string, nextAttemptAt: Date, now: Date): Promise<void>;
  listReconcileGroups(): Promise<Array<{ workspaceId: string; groupId: string }>>;
  scheduleReconciliation(workspaceId: string, members: Array<{ qqNumber: string; card: string }>, now: Date): Promise<void>;
  refreshProfileTargets(now: Date): Promise<void>;
  resumePending(now: Date): Promise<void>;
  cleanup(now: Date): Promise<void>;
}
export interface GroupCardCoordinatorDependencies {
  repository: GroupCardSyncRepository;
  client: Pick<QQBotClient, "getStatus" | "getGroupMemberInfo" | "getGroupMemberList" | "setGroupCard">;
  mode: () => GroupCardSyncMode;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  log?: { info: (data: unknown, message: string) => void; warn: (data: unknown, message: string) => void; error: (data: unknown, message: string) => void };
}
