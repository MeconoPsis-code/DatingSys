ALTER TABLE "rating_profiles"
  ADD COLUMN "rankingOptIn" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "rankingOptInUpdatedAt" TIMESTAMP(3);

CREATE INDEX "rating_profiles_rankingOptIn_finalScore_idx"
  ON "rating_profiles"("rankingOptIn", "finalScore");
