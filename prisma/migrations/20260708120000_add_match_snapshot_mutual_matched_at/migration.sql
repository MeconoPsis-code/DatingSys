ALTER TABLE "match_snapshots"
  ADD COLUMN "mutualMatchedAt" TIMESTAMP(3);

UPDATE "match_snapshots"
SET "mutualMatchedAt" = "computedAt"
WHERE "matchType" = 'mutual';

CREATE INDEX "match_snapshots_matchType_mutualMatchedAt_idx"
  ON "match_snapshots"("matchType", "mutualMatchedAt");
