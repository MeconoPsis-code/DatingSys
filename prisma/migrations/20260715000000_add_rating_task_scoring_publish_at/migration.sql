BEGIN;

-- Keep the snapshot backfill stable while the migration runs. The table locks
-- are released at COMMIT and prevent a partially frozen task/photo set.
LOCK TABLE "profiles" IN SHARE MODE;
LOCK TABLE "profile_photos" IN SHARE MODE;
LOCK TABLE "rating_tasks" IN ACCESS EXCLUSIVE MODE;
LOCK TABLE "rating_scores" IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE "rating_tasks"
ADD COLUMN "scoringPublishAt" TIMESTAMP(3),
ADD COLUMN "photoObjectKeys" JSONB,
ADD COLUMN "photoUploadBatchAt" TIMESTAMP(3),
ADD COLUMN "publishedScore" DOUBLE PRECISION,
ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX "rating_tasks_scoringPublishAt_idx"
ON "rating_tasks"("scoringPublishAt");

-- Freeze the photo set used by legacy tasks before new uploads can appear in
-- both an old dynamic task and their new 18:00 upload batch.
UPDATE "rating_tasks" AS task
SET "photoObjectKeys" = COALESCE(
  (
    SELECT jsonb_agg(to_jsonb(photo."storageKey") ORDER BY photo."order")
    FROM "profile_photos" AS photo
    INNER JOIN "profiles" AS profile ON profile."id" = photo."profileId"
    WHERE profile."userId" = task."ratedUserId"
  ),
  jsonb_build_array(task."photoObjectKey")
)
WHERE task."photoObjectKeys" IS NULL;

-- Assign every active legacy task to its upload window. Duplicate tasks are
-- merged immediately below before the unique index is created.
WITH active_batches AS (
  SELECT
    task."id",
    task."ratedUserId",
    CASE
      WHEN (task."createdAt" + INTERVAL '8 hours')::time < TIME '18:00'
        THEN date_trunc('day', task."createdAt" + INTERVAL '8 hours') - INTERVAL '8 hours'
      ELSE date_trunc('day', task."createdAt" + INTERVAL '8 hours') + INTERVAL '16 hours'
    END AS batch_at
  FROM "rating_tasks" AS task
  WHERE task."photoUploadBatchAt" IS NULL
    AND task."status" IN ('PENDING', 'SCORING', 'NEEDS_RESCORE', 'REPORTED')
)
UPDATE "rating_tasks" AS task
SET
  "photoUploadBatchAt" = active_batches.batch_at,
  "scoringPublishAt" = active_batches.batch_at
FROM active_batches
WHERE task."id" = active_batches."id";

-- Old application versions used a non-atomic find-then-create flow, so merge
-- any duplicate active tasks already present in the same user/batch. Prefer a
-- reported/rescore task, then the task with the most scoring progress.
CREATE TEMP TABLE "_rating_task_batch_members" ON COMMIT DROP AS
SELECT
  task."id" AS "memberId",
  first_value(task."id") OVER task_batch AS "canonicalId",
  row_number() OVER task_batch AS "memberRank"
FROM "rating_tasks" AS task
WHERE task."photoUploadBatchAt" IS NOT NULL
WINDOW task_batch AS (
  PARTITION BY task."ratedUserId", task."photoUploadBatchAt"
  ORDER BY
    CASE task."status"
      WHEN 'REPORTED' THEN 0
      WHEN 'NEEDS_RESCORE' THEN 1
      WHEN 'SCORING' THEN 2
      WHEN 'PENDING' THEN 3
      ELSE 4
    END,
    (SELECT count(*) FROM "rating_scores" AS score WHERE score."ratingTaskId" = task."id") DESC,
    task."updatedAt" DESC,
    task."createdAt" ASC,
    task."id" ASC
);

-- Preserve one score per scorer across duplicate tasks before repointing the
-- surviving score rows to the canonical task.
WITH ranked_scores AS (
  SELECT
    score."id",
    row_number() OVER (
      PARTITION BY member."canonicalId", score."scorerUserId"
      ORDER BY
        (member."memberId" = member."canonicalId") DESC,
        score."createdAt" DESC,
        score."id" ASC
    ) AS score_rank
  FROM "rating_scores" AS score
  INNER JOIN "_rating_task_batch_members" AS member
    ON member."memberId" = score."ratingTaskId"
)
DELETE FROM "rating_scores" AS score
USING ranked_scores
WHERE score."id" = ranked_scores."id"
  AND ranked_scores.score_rank > 1;

UPDATE "rating_scores" AS score
SET "ratingTaskId" = member."canonicalId"
FROM "_rating_task_batch_members" AS member
WHERE score."ratingTaskId" = member."memberId"
  AND member."memberId" <> member."canonicalId";

-- Preserve reports from every duplicate member. A scorer can only contribute
-- one effective report; keep the newest report for the same reporter.
WITH expanded_reports AS (
  SELECT
    member."canonicalId",
    report.value AS report_value,
    report.value ->> 'reporterId' AS reporter_id,
    report.value ->> 'createdAt' AS report_created_at,
    member."memberId" = member."canonicalId" AS is_canonical
  FROM "_rating_task_batch_members" AS member
  INNER JOIN "rating_tasks" AS task ON task."id" = member."memberId"
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(task."photoReports") = 'array' THEN task."photoReports"
      ELSE '[]'::jsonb
    END
  ) AS report(value)
  WHERE report.value ? 'reporterId'
), ranked_reports AS (
  SELECT
    expanded_reports.*,
    row_number() OVER (
      PARTITION BY expanded_reports."canonicalId", expanded_reports.reporter_id
      ORDER BY
        expanded_reports.report_created_at DESC NULLS LAST,
        expanded_reports.is_canonical DESC,
        expanded_reports.report_value::text ASC
    ) AS report_rank
  FROM expanded_reports
), merged_reports AS (
  SELECT
    ranked_reports."canonicalId",
    jsonb_agg(
      ranked_reports.report_value
      ORDER BY ranked_reports.report_created_at, ranked_reports.reporter_id
    ) AS reports
  FROM ranked_reports
  WHERE ranked_reports.report_rank = 1
  GROUP BY ranked_reports."canonicalId"
)
UPDATE "rating_tasks" AS canonical
SET "photoReports" = merged_reports.reports
FROM merged_reports
WHERE canonical."id" = merged_reports."canonicalId";

DELETE FROM "rating_tasks" AS task
USING "_rating_task_batch_members" AS member
WHERE task."id" = member."memberId"
  AND member."memberRank" > 1;

CREATE UNIQUE INDEX "rating_tasks_ratedUserId_photoUploadBatchAt_key"
ON "rating_tasks"("ratedUserId", "photoUploadBatchAt");

-- Rolling-deploy compatibility: if an old application instance creates a task
-- after this migration commits, freeze its current photos and batch at INSERT
-- time so the new unique invariant and multi-photo display remain correct.
CREATE FUNCTION "rating_task_fill_batch_defaults"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."photoObjectKeys" IS NULL THEN
    NEW."photoObjectKeys" := COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(photo."storageKey") ORDER BY photo."order")
        FROM "profile_photos" AS photo
        INNER JOIN "profiles" AS profile ON profile."id" = photo."profileId"
        WHERE profile."userId" = NEW."ratedUserId"
      ),
      jsonb_build_array(NEW."photoObjectKey")
    );
  END IF;

  IF NEW."photoUploadBatchAt" IS NULL
    AND NEW."status" IN ('PENDING', 'SCORING', 'NEEDS_RESCORE', 'REPORTED') THEN
    NEW."photoUploadBatchAt" := CASE
      WHEN (NEW."createdAt" + INTERVAL '8 hours')::time < TIME '18:00'
        THEN date_trunc('day', NEW."createdAt" + INTERVAL '8 hours') - INTERVAL '8 hours'
      ELSE date_trunc('day', NEW."createdAt" + INTERVAL '8 hours') + INTERVAL '16 hours'
    END;
  END IF;

  IF NEW."scoringPublishAt" IS NULL AND NEW."photoUploadBatchAt" IS NOT NULL THEN
    NEW."scoringPublishAt" := NEW."photoUploadBatchAt";
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "rating_task_fill_batch_defaults_before_insert"
BEFORE INSERT ON "rating_tasks"
FOR EACH ROW
EXECUTE FUNCTION "rating_task_fill_batch_defaults"();

-- Preserve the currently published result for legacy data on the user's most
-- recently completed task. New task completions write this field directly.
UPDATE "rating_tasks" AS task
SET "publishedScore" = profile."finalScore"
FROM "rating_profiles" AS profile
WHERE task."ratedUserId" = profile."userId"
  AND task."status" = 'COMPLETED'
  AND profile."finalScore" IS NOT NULL
  AND task."id" = (
    SELECT latest."id"
    FROM "rating_tasks" AS latest
    WHERE latest."ratedUserId" = task."ratedUserId"
      AND latest."status" = 'COMPLETED'
    ORDER BY latest."completedAt" DESC NULLS LAST, latest."updatedAt" DESC
    LIMIT 1
  );

COMMIT;
