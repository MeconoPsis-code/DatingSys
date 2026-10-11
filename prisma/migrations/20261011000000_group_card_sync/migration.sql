-- CreateTable
CREATE TABLE "user_nickname_sync" (
    "userId" TEXT NOT NULL,
    "nicknameRevision" INTEGER NOT NULL DEFAULT 0,
    "cardRevision" INTEGER NOT NULL DEFAULT 0,
    "nicknameChangedAt" TIMESTAMP(3),
    "nicknameSource" TEXT,
    "nicknameSourceGroupId" TEXT,
    "profileFingerprint" TEXT,
    "initializedAt" TIMESTAMP(3),
    "nextWorkAt" TIMESTAMP(3),
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "manualRetryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_nickname_sync_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "group_card_sync_states" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "qqNumber" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "desiredCard" TEXT NOT NULL,
    "desiredNicknameRevision" INTEGER NOT NULL DEFAULT 0,
    "desiredCardRevision" INTEGER NOT NULL DEFAULT 0,
    "observedCard" TEXT,
    "observedAt" TIMESTAMP(3),
    "observedSeq" INTEGER NOT NULL DEFAULT 0,
    "resolvedObservedCard" TEXT,
    "resolvedObservationSeq" INTEGER NOT NULL DEFAULT 0,
    "resolvedAt" TIMESTAMP(3),
    "confirmedCard" TEXT,
    "confirmedRevision" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "pendingSince" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "lastError" TEXT,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_card_sync_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_card_sync_inbox" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "userId" TEXT,
    "groupId" TEXT NOT NULL,
    "qqNumber" TEXT NOT NULL,
    "selfId" TEXT NOT NULL,
    "cardOld" TEXT NOT NULL,
    "cardNew" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawPayload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "outcome" TEXT,
    "error" TEXT,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "group_card_sync_inbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_card_write_attempts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "qqNumber" TEXT NOT NULL,
    "nicknameRevision" INTEGER NOT NULL,
    "cardRevision" INTEGER NOT NULL,
    "targetCard" TEXT NOT NULL,
    "fromObservedCard" TEXT,
    "baselineObservationSeq" INTEGER NOT NULL,
    "leaseToken" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'prepared',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "readAfter" TEXT,
    "errorCode" TEXT,
    "error" TEXT,

    CONSTRAINT "group_card_write_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_nickname_sync_nextWorkAt_leaseUntil_idx" ON "user_nickname_sync"("nextWorkAt", "leaseUntil");

-- CreateIndex
CREATE INDEX "group_card_sync_states_workspaceId_status_idx" ON "group_card_sync_states"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "group_card_sync_states_status_nextAttemptAt_idx" ON "group_card_sync_states"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "group_card_sync_states_userId_status_idx" ON "group_card_sync_states"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "group_card_sync_states_userId_groupId_key" ON "group_card_sync_states"("userId", "groupId");

-- CreateIndex
CREATE UNIQUE INDEX "group_card_sync_inbox_eventKey_key" ON "group_card_sync_inbox"("eventKey");

-- CreateIndex
CREATE INDEX "group_card_sync_inbox_userId_status_nextAttemptAt_idx" ON "group_card_sync_inbox"("userId", "status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "group_card_sync_inbox_status_finishedAt_idx" ON "group_card_sync_inbox"("status", "finishedAt");

-- CreateIndex
CREATE INDEX "group_card_sync_inbox_groupId_receivedAt_idx" ON "group_card_sync_inbox"("groupId", "receivedAt");

-- CreateIndex
CREATE INDEX "group_card_write_attempts_userId_groupId_startedAt_idx" ON "group_card_write_attempts"("userId", "groupId", "startedAt");

-- CreateIndex
CREATE INDEX "group_card_write_attempts_status_completedAt_idx" ON "group_card_write_attempts"("status", "completedAt");

-- AddForeignKey
ALTER TABLE "user_nickname_sync" ADD CONSTRAINT "user_nickname_sync_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_card_sync_states" ADD CONSTRAINT "group_card_sync_states_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_card_sync_states" ADD CONSTRAINT "group_card_sync_states_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_card_sync_inbox" ADD CONSTRAINT "group_card_sync_inbox_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_card_write_attempts" ADD CONSTRAINT "group_card_write_attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Pending-only indexes keep due-work scans independent of retained history.
CREATE INDEX "group_card_sync_states_due_idx" ON "group_card_sync_states"("nextAttemptAt", "userId")
WHERE "status" IN ('pending', 'failed', 'syncing') AND "nextAttemptAt" IS NOT NULL;
CREATE INDEX "group_card_sync_inbox_due_idx" ON "group_card_sync_inbox"("nextAttemptAt", "userId")
WHERE "status" = 'pending';
CREATE INDEX "user_nickname_sync_due_idx" ON "user_nickname_sync"("nextWorkAt")
WHERE "nextWorkAt" IS NOT NULL;
