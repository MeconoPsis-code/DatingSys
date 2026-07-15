import test from "node:test";
import assert from "node:assert/strict";
import type { RatingTaskStatus } from "@prisma/client";
import { deriveRatingProfileState } from "../src/lib/rating-profile-sync";

function task(
  status: RatingTaskStatus,
  publishedScore: number | null = null,
  completedAt: Date | null = null,
  scoringPublishAt: Date | null = null
) {
  return {
    status,
    publishedScore,
    scoringPublishAt,
    completedAt,
    updatedAt: completedAt ?? new Date("2026-07-15T00:00:00.000Z"),
  };
}

test("keeps a user pending while a later upload batch still waits", () => {
  const state = deriveRatingProfileState([
    task("COMPLETED", 7, new Date("2026-07-14T15:00:00.000Z")),
    task("PENDING"),
  ]);

  assert.equal(state.ratingStatus, "PENDING");
  assert.equal(state.finalScore, null);
  assert.equal(state.scoreCompletedAt, null);
});

test("lets active scoring outrank pending and review batches", () => {
  const state = deriveRatingProfileState([
    task("REVIEW"),
    task("PENDING"),
    task("SCORING"),
  ]);

  assert.equal(state.ratingStatus, "SCORING");
  assert.equal(state.finalScore, null);
});

test("keeps review state until every batch is published", () => {
  const state = deriveRatingProfileState([
    task("COMPLETED", 7, new Date("2026-07-14T15:00:00.000Z")),
    task("REVIEW"),
  ]);

  assert.equal(state.ratingStatus, "REVIEW");
  assert.equal(state.finalScore, null);
});

test("publishes the most recently completed batch after all batches finish", () => {
  const latestCompletedAt = new Date("2026-07-15T15:00:00.000Z");
  const state = deriveRatingProfileState([
    task("COMPLETED", 7, new Date("2026-07-14T15:00:00.000Z")),
    task("COMPLETED", 8, latestCompletedAt),
  ]);

  assert.equal(state.ratingStatus, "COMPLETED");
  assert.equal(state.finalScore, 8);
  assert.equal(state.scoreCompletedAt?.toISOString(), latestCompletedAt.toISOString());
});

test("prioritizes a focused rescore over every other unfinished batch", () => {
  const state = deriveRatingProfileState([
    task("REVIEW"),
    task("SCORING"),
    task("NEEDS_RESCORE"),
  ]);

  assert.equal(state.ratingStatus, "NEEDS_RESCORE");
  assert.equal(state.finalScore, null);
});

test("uses the newest scoring batch when completion timestamps tie", () => {
  const completedAt = new Date("2026-07-15T15:00:00.000Z");
  const state = deriveRatingProfileState([
    task("COMPLETED", 7, completedAt, new Date("2026-07-13T16:00:00.000Z")),
    task("COMPLETED", 8, completedAt, new Date("2026-07-14T16:00:00.000Z")),
  ]);

  assert.equal(state.finalScore, 8);
});
