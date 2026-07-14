import test from "node:test";
import assert from "node:assert/strict";
import { getScoringTaskTimeline } from "../src/lib/scoring";

test("assigns uploads before the 18:00 China cutoff to today's scoring batch", () => {
  const createdAt = new Date("2026-07-14T09:59:59.999Z"); // 17:59:59.999 China time
  const timeline = getScoringTaskTimeline(createdAt, createdAt);

  assert.equal(timeline.pendingAt.toISOString(), "2026-07-13T10:00:00.000Z");
  assert.equal(timeline.publishAt.toISOString(), "2026-07-13T16:00:00.000Z");
  assert.equal(timeline.scoringDeadlineAt.toISOString(), "2026-07-14T16:00:00.000Z");
  assert.equal(timeline.phase, "PUBLISHING");
  assert.equal(timeline.isReleasedForScoring, true);
});

test("holds uploads from 18:00 China time for tomorrow's scoring batch", () => {
  const createdAt = new Date("2026-07-14T10:00:00.000Z"); // 18:00 China time
  const timeline = getScoringTaskTimeline(createdAt, createdAt);

  assert.equal(timeline.pendingAt.toISOString(), "2026-07-14T10:00:00.000Z");
  assert.equal(timeline.publishAt.toISOString(), "2026-07-14T16:00:00.000Z");
  assert.equal(timeline.scoringDeadlineAt.toISOString(), "2026-07-15T16:00:00.000Z");
  assert.equal(timeline.phase, "PENDING");
  assert.equal(timeline.isReleasedForScoring, false);
});

test("keeps the scoring window open from 00:00 through 23:59 China time", () => {
  const createdAt = new Date("2026-07-13T10:00:00.000Z");
  const beforeMidnight = new Date("2026-07-14T15:59:59.999Z");
  const atMidnight = new Date("2026-07-14T16:00:00.000Z");

  assert.equal(getScoringTaskTimeline(createdAt, beforeMidnight).isReleasedForScoring, true);
  assert.equal(getScoringTaskTimeline(createdAt, atMidnight).isReleasedForScoring, false);
});
