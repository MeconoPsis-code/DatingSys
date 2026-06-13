/*
  Warnings:

  - The values [PROFILE_FROZEN] on the enum `PenaltyType` will be removed. If these variants are still used in the database, this will fail.
  - The values [FROZEN] on the enum `UserStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MembershipStatus" ADD VALUE 'LEFT_PENDING_REVIEW';
ALTER TYPE "MembershipStatus" ADD VALUE 'LEFT_CONFIRMED';
ALTER TYPE "MembershipStatus" ADD VALUE 'RESTORED';
ALTER TYPE "MembershipStatus" ADD VALUE 'REMOVED';

-- AlterEnum
BEGIN;
CREATE TYPE "PenaltyType_new" AS ENUM ('WARNING', 'ACCOUNT_BANNED');
ALTER TABLE "penalties" ALTER COLUMN "type" TYPE "PenaltyType_new" USING ("type"::text::"PenaltyType_new");
ALTER TYPE "PenaltyType" RENAME TO "PenaltyType_old";
ALTER TYPE "PenaltyType_new" RENAME TO "PenaltyType";
DROP TYPE "public"."PenaltyType_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "UserStatus_new" AS ENUM ('ACTIVE', 'BANNED', 'DELETED');
ALTER TABLE "public"."users" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "status" TYPE "UserStatus_new" USING ("status"::text::"UserStatus_new");
ALTER TYPE "UserStatus" RENAME TO "UserStatus_old";
ALTER TYPE "UserStatus_new" RENAME TO "UserStatus";
DROP TYPE "public"."UserStatus_old";
ALTER TABLE "users" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
COMMIT;

-- AlterTable
ALTER TABLE "group_memberships" ADD COLUMN     "leaveType" TEXT,
ADD COLUMN     "leftConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "leftDetectedAt" TIMESTAMP(3),
ADD COLUMN     "rawEvent" JSONB,
ADD COLUMN     "removedAt" TIMESTAMP(3),
ADD COLUMN     "restoredAt" TIMESTAMP(3),
ADD COLUMN     "reviewReason" TEXT,
ADD COLUMN     "reviewRemark" TEXT,
ADD COLUMN     "reviewedBy" TEXT;

-- CreateTable
CREATE TABLE "bot_identities" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "qqNumber" TEXT NOT NULL,
    "qqEmail" TEXT NOT NULL,
    "qqNickname" TEXT,
    "qqAvatarUrl" TEXT,
    "qqAvatarSyncedAt" TIMESTAMP(3),
    "groupId" TEXT NOT NULL,
    "groupCard" TEXT,
    "groupCardStatus" TEXT,
    "groupCardSyncStatus" TEXT,
    "groupCardSyncedAt" TIMESTAMP(3),
    "registeredFromGroupId" TEXT NOT NULL,
    "lastCommandAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bot_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bot_event_logs" (
    "id" TEXT NOT NULL,
    "eventId" TEXT,
    "platform" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "groupId" TEXT,
    "qqNumber" TEXT,
    "messageText" TEXT,
    "rawPayload" JSONB NOT NULL,
    "handled" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bot_event_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bot_action_logs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "groupId" TEXT,
    "qqNumber" TEXT,
    "status" TEXT NOT NULL,
    "request" JSONB,
    "response" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bot_action_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_reviews" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "userId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reason" TEXT NOT NULL,
    "metadata" JSONB,
    "handledBy" TEXT,
    "handledAt" TIMESTAMP(3),
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bot_identities_qqNumber_key" ON "bot_identities"("qqNumber");

-- CreateIndex
CREATE INDEX "bot_identities_groupId_idx" ON "bot_identities"("groupId");

-- CreateIndex
CREATE INDEX "bot_event_logs_eventId_idx" ON "bot_event_logs"("eventId");

-- CreateIndex
CREATE INDEX "bot_event_logs_groupId_idx" ON "bot_event_logs"("groupId");

-- CreateIndex
CREATE INDEX "bot_event_logs_qqNumber_idx" ON "bot_event_logs"("qqNumber");

-- CreateIndex
CREATE INDEX "bot_action_logs_action_idx" ON "bot_action_logs"("action");

-- CreateIndex
CREATE INDEX "bot_action_logs_groupId_idx" ON "bot_action_logs"("groupId");

-- CreateIndex
CREATE INDEX "bot_action_logs_qqNumber_idx" ON "bot_action_logs"("qqNumber");

-- CreateIndex
CREATE INDEX "admin_reviews_type_idx" ON "admin_reviews"("type");

-- CreateIndex
CREATE INDEX "admin_reviews_userId_idx" ON "admin_reviews"("userId");

-- CreateIndex
CREATE INDEX "admin_reviews_status_idx" ON "admin_reviews"("status");
