import test from "node:test";
import assert from "node:assert/strict";
import {
  getBirthDayOptions,
  getDaysInMonth,
  isValidCalendarDate,
  keepValidBirthDay,
} from "../src/lib/date-input";

test("limits each month to its real calendar days", () => {
  assert.equal(getDaysInMonth("2008", "6"), 30);
  assert.equal(getDaysInMonth("2008", "2"), 29);
  assert.equal(getDaysInMonth("2007", "2"), 28);
  assert.equal(getBirthDayOptions("2008", "6").at(-1), 30);
});

test("clears a selected day when a year or month change makes it invalid", () => {
  assert.equal(keepValidBirthDay("31", "2008", "6"), "");
  assert.equal(keepValidBirthDay("29", "2007", "2"), "");
  assert.equal(keepValidBirthDay("29", "2008", "2"), "29");
});

test("rejects impossible dates while accepting valid leap dates", () => {
  assert.equal(isValidCalendarDate("2008", "6", "31"), false);
  assert.equal(isValidCalendarDate("2007", "2", "29"), false);
  assert.equal(isValidCalendarDate("2008", "2", "29"), true);
  assert.equal(isValidCalendarDate("2008", "6", "30"), true);
});
