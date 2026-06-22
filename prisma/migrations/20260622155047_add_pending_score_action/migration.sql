-- AlterTable
ALTER TABLE "rating_tasks" ADD COLUMN     "pendingActionActorId" TEXT,
ADD COLUMN     "pendingActionExpiresAt" TIMESTAMP(3),
ADD COLUMN     "pendingActionType" TEXT,
ADD COLUMN     "pendingActionValue" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "rating_tasks_pendingActionExpiresAt_idx" ON "rating_tasks"("pendingActionExpiresAt");
