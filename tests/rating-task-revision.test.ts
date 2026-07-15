import test from "node:test";
import assert from "node:assert/strict";
import { isValidRatingTaskRevision } from "../src/lib/rating-task-revision";

test("requires a positive integer rating task revision", () => {
  assert.equal(isValidRatingTaskRevision(1), true);
  assert.equal(isValidRatingTaskRevision(12), true);
  assert.equal(isValidRatingTaskRevision(undefined), false);
  assert.equal(isValidRatingTaskRevision(null), false);
  assert.equal(isValidRatingTaskRevision(0), false);
  assert.equal(isValidRatingTaskRevision(-1), false);
  assert.equal(isValidRatingTaskRevision(1.5), false);
  assert.equal(isValidRatingTaskRevision("1"), false);
});
