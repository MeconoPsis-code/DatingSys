-- CreateTable
CREATE TABLE "scorer_duty_schedules" (
    "id" TEXT NOT NULL,
    "scorerUserId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scorer_duty_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "scorer_duty_schedules_scorerUserId_weekday_key" ON "scorer_duty_schedules"("scorerUserId", "weekday");

-- CreateIndex
CREATE INDEX "scorer_duty_schedules_weekday_idx" ON "scorer_duty_schedules"("weekday");

-- AddForeignKey
ALTER TABLE "scorer_duty_schedules" ADD CONSTRAINT "scorer_duty_schedules_scorerUserId_fkey" FOREIGN KEY ("scorerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve existing scorer behavior on rollout: current active scorers/admins start on duty every day.
INSERT INTO "scorer_duty_schedules" ("id", "scorerUserId", "weekday", "createdAt", "updatedAt")
SELECT
    'duty_' || "users"."id" || '_' || days."weekday",
    "users"."id",
    days."weekday",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "users"
CROSS JOIN generate_series(1, 7) AS days("weekday")
WHERE "users"."role" IN ('SCORER', 'ADMIN')
  AND "users"."status" = 'ACTIVE'
ON CONFLICT ("scorerUserId", "weekday") DO NOTHING;
