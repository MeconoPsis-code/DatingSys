-- CreateEnum
CREATE TYPE "WorkspaceStatus" AS ENUM ('ACTIVE', 'PAUSED', 'DELETED');

-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('MEMBER', 'ADMIN', 'OWNER');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "sourceWorkspaceId" TEXT;

-- AlterTable
ALTER TABLE "reports" ADD COLUMN     "workspaceId" TEXT;

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "category" TEXT,
ADD COLUMN     "workspaceId" TEXT;
ALTER TABLE "notifications" ADD COLUMN     "dedupeKey" VARCHAR(128);

-- AlterTable
ALTER TABLE "announcements" ADD COLUMN     "workspaceId" TEXT;
ALTER TABLE "match_snapshots" ADD COLUMN "notifiedAt" TIMESTAMP(3);

ALTER TABLE "admin_reviews" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "workspaceId" TEXT;

-- CreateTable
CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "qqGroupId" TEXT NOT NULL,
    "logoUrl" TEXT,
    "description" TEXT,
    "contactName" TEXT,
    "botEnabled" BOOLEAN NOT NULL DEFAULT true,
    "botConfig" JSONB,
    "status" "WorkspaceStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_members" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_packages" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "priceLabel" TEXT,
    "benefits" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cdks" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "redeemedBy" TEXT,
    "redeemedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cdks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_entitlements" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3),
    "sourceCdkId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_channels" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bot_push_logs" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT,
    "workspaceId" TEXT,
    "userId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bot_push_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "cdkId" TEXT,
    "packageId" TEXT,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_logs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_configs" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_configs_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_slug_key" ON "workspaces"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_qqGroupId_key" ON "workspaces"("qqGroupId");

-- CreateIndex
CREATE INDEX "workspaces_status_expiresAt_idx" ON "workspaces"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "workspace_members_userId_role_idx" ON "workspace_members"("userId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_members_workspaceId_userId_key" ON "workspace_members"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "cdks_codeHash_key" ON "cdks"("codeHash");

-- CreateIndex
CREATE INDEX "cdks_packageId_redeemedAt_idx" ON "cdks"("packageId", "redeemedAt");

-- CreateIndex
CREATE INDEX "user_entitlements_userId_type_expiresAt_idx" ON "user_entitlements"("userId", "type", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "notification_channels_userId_channel_key" ON "notification_channels"("userId", "channel");

-- CreateIndex
CREATE INDEX "bot_push_logs_workspaceId_createdAt_idx" ON "bot_push_logs"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "bot_push_logs_status_createdAt_idx" ON "bot_push_logs"("status", "createdAt");

-- CreateIndex
CREATE INDEX "support_logs_userId_createdAt_idx" ON "support_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "support_logs_action_createdAt_idx" ON "support_logs"("action", "createdAt");

-- CreateIndex
CREATE INDEX "workspace_logs_workspaceId_createdAt_idx" ON "workspace_logs"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "reports_workspaceId_status_idx" ON "reports"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "notifications_workspaceId_createdAt_idx" ON "notifications"("workspaceId", "createdAt");
CREATE UNIQUE INDEX "notifications_dedupeKey_key" ON "notifications"("dedupeKey");

-- CreateIndex
CREATE INDEX "announcements_workspaceId_status_idx" ON "announcements"("workspaceId", "status");
CREATE INDEX "admin_reviews_workspaceId_status_idx" ON "admin_reviews"("workspaceId", "status");
CREATE INDEX "audit_logs_workspaceId_createdAt_idx" ON "audit_logs"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_sourceWorkspaceId_fkey" FOREIGN KEY ("sourceWorkspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "admin_reviews" ADD CONSTRAINT "admin_reviews_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cdks" ADD CONSTRAINT "cdks_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "support_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cdks" ADD CONSTRAINT "cdks_redeemedBy_fkey" FOREIGN KEY ("redeemedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_entitlements" ADD CONSTRAINT "user_entitlements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_entitlements" ADD CONSTRAINT "user_entitlements_sourceCdkId_fkey" FOREIGN KEY ("sourceCdkId") REFERENCES "cdks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_channels" ADD CONSTRAINT "notification_channels_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bot_push_logs" ADD CONSTRAINT "bot_push_logs_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bot_push_logs" ADD CONSTRAINT "bot_push_logs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bot_push_logs" ADD CONSTRAINT "bot_push_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_logs" ADD CONSTRAINT "support_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_logs" ADD CONSTRAINT "support_logs_cdkId_fkey" FOREIGN KEY ("cdkId") REFERENCES "cdks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_logs" ADD CONSTRAINT "support_logs_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "support_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_logs" ADD CONSTRAINT "workspace_logs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_logs" ADD CONSTRAINT "workspace_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Preserve the existing single-group installation as the official workspace.
-- A stable ID makes the backfill deterministic and keeps historical records intact.
INSERT INTO "workspaces" ("id", "slug", "name", "qqGroupId", "botEnabled", "status", "updatedAt")
VALUES (
  'official', 'official', '官方群',
  COALESCE(
    (SELECT "groupId" FROM "bot_identities" WHERE "groupId" <> '' ORDER BY "createdAt" LIMIT 1),
    (SELECT "groupId" FROM "group_memberships" WHERE "groupId" <> 'default' ORDER BY "createdAt" LIMIT 1),
    'default'
  ),
  true, 'ACTIVE', CURRENT_TIMESTAMP
);

UPDATE "users" SET "sourceWorkspaceId" = 'official' WHERE "sourceWorkspaceId" IS NULL;
UPDATE "reports" SET "workspaceId" = 'official' WHERE "workspaceId" IS NULL;
UPDATE "notifications" SET "workspaceId" = 'official' WHERE "workspaceId" IS NULL;
UPDATE "announcements" SET "workspaceId" = 'official' WHERE "workspaceId" IS NULL;
-- Existing matches were already visible before V2; do not flood users on first read.
UPDATE "match_snapshots" SET "notifiedAt" = CURRENT_TIMESTAMP WHERE "matchType" = 'mutual';
UPDATE "admin_reviews" SET "workspaceId" = 'official' WHERE "workspaceId" IS NULL;
UPDATE "audit_logs" SET "workspaceId" = 'official' WHERE "workspaceId" IS NULL;

INSERT INTO "workspace_members" ("id", "workspaceId", "userId", "role", "joinedAt", "createdAt", "updatedAt")
SELECT 'official-' || u."id", 'official', u."id",
  CASE WHEN u."role" = 'ADMIN' THEN 'ADMIN'::"WorkspaceRole" ELSE 'MEMBER'::"WorkspaceRole" END,
  u."createdAt", u."createdAt", CURRENT_TIMESTAMP
FROM "users" u
WHERE u."status" <> 'DELETED'
  AND (u."role" IN ('ADMIN', 'SUPER_ADMIN') OR EXISTS (
    SELECT 1 FROM "group_memberships" gm
    WHERE gm."userId" = u."id" AND gm."status" IN ('VERIFIED', 'RESTORED')
  ));

INSERT INTO "system_configs" ("key", "value", "updatedAt") VALUES
  ('registrationOpen', 'true'::jsonb, CURRENT_TIMESTAMP),
  ('matchingOpen', 'true'::jsonb, CURRENT_TIMESTAMP),
  ('photosOpen', 'true'::jsonb, CURRENT_TIMESTAMP),
  ('scoringOpen', 'true'::jsonb, CURRENT_TIMESTAMP),
  ('botOpen', 'true'::jsonb, CURRENT_TIMESTAMP),
  ('sponsorshipOpen', 'true'::jsonb, CURRENT_TIMESTAMP),
  ('homeAnnouncement', '""'::jsonb, CURRENT_TIMESTAMP),
  ('maintenanceAnnouncement', '""'::jsonb, CURRENT_TIMESTAMP);
