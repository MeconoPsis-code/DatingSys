import test from "node:test";
import assert from "node:assert/strict";
import {
  createProfilePublishScoringBatch,
  getChinaDayStart,
  getRatingTaskTimeline,
  getScoringTaskTimeline,
  hasSamePhotoKeySet,
} from "../src/lib/scoring";

test("assigns a profile published before 18:00 to today's scoring batch", () => {
  const createdAt = new Date("2026-07-14T09:59:59.999Z"); // 17:59:59.999 China time
  const timeline = getScoringTaskTimeline(createdAt, createdAt);

  assert.equal(timeline.pendingAt.toISOString(), "2026-07-13T10:00:00.000Z");
  assert.equal(timeline.publishAt.toISOString(), "2026-07-13T16:00:00.000Z");
  assert.equal(timeline.scoringDeadlineAt.toISOString(), "2026-07-14T16:00:00.000Z");
  assert.equal(timeline.phase, "PUBLISHING");
  assert.equal(timeline.isReleasedForScoring, true);
});

test("holds a profile published from 18:00 for tomorrow's scoring batch", () => {
  const createdAt = new Date("2026-07-14T10:00:00.000Z"); // 18:00 China time
  const timeline = getScoringTaskTimeline(createdAt, createdAt);

  assert.equal(timeline.pendingAt.toISOString(), "2026-07-14T10:00:00.000Z");
  assert.equal(timeline.publishAt.toISOString(), "2026-07-14T16:00:00.000Z");
  assert.equal(timeline.scoringDeadlineAt.toISOString(), "2026-07-15T16:00:00.000Z");
  assert.equal(timeline.phase, "PENDING");
  assert.equal(timeline.isReleasedForScoring, false);
});

test("queues one complete photo snapshot at publication time", () => {
  const publishedAt = new Date("2026-07-14T09:30:00.000Z");
  const batch = createProfilePublishScoringBatch(
    ["photos/user/a.webp", "photos/user/b.webp", "photos/user/a.webp"],
    publishedAt
  );

  assert.equal(batch.queuedAt, publishedAt);
  assert.deepEqual(batch.photoObjectKeys, ["photos/user/a.webp", "photos/user/b.webp"]);
});

test("requires a task snapshot to match the complete published photo set", () => {
  assert.equal(
    hasSamePhotoKeySet(
      ["photos/user/a.webp", "photos/user/b.webp"],
      ["photos/user/b.webp", "photos/user/a.webp"]
    ),
    true
  );
  assert.equal(
    hasSamePhotoKeySet(
      ["photos/user/a.webp"],
      ["photos/user/a.webp", "photos/user/b.webp"]
    ),
    false
  );
});

test("keeps the scoring window open from 00:00 through 23:59 China time", () => {
  const createdAt = new Date("2026-07-13T10:00:00.000Z");
  const beforeMidnight = new Date("2026-07-14T15:59:59.999Z");
  const atMidnight = new Date("2026-07-14T16:00:00.000Z");

  assert.equal(
    getScoringTaskTimeline(createdAt, beforeMidnight).isReleasedForScoring,
    true
  );
  assert.equal(getScoringTaskTimeline(createdAt, atMidnight).isReleasedForScoring, false);
});

test("puts an admin rescore requested after 18:00 into today's open batch", () => {
  const requestedAt = new Date("2026-07-14T14:00:00.000Z"); // 22:00 China time
  const originalCreatedAt = new Date("2026-07-10T02:00:00.000Z");
  const scoringPublishAt = getChinaDayStart(requestedAt);
  const timeline = getRatingTaskTimeline(
    { createdAt: originalCreatedAt, scoringPublishAt },
    requestedAt
  );

  assert.equal(originalCreatedAt.toISOString(), "2026-07-10T02:00:00.000Z");
  assert.equal(scoringPublishAt.toISOString(), "2026-07-13T16:00:00.000Z");
  assert.equal(timeline.publishAt.toISOString(), "2026-07-13T16:00:00.000Z");
  assert.equal(timeline.scoringDeadlineAt.toISOString(), "2026-07-14T16:00:00.000Z");
  assert.equal(timeline.isReleasedForScoring, true);
});
