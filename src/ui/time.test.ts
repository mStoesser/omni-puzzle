import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDay, timeAgo } from "./time.ts";

const now = Date.parse("2026-11-03T12:00:00Z");

test("timeAgo uses minutes, hours and days", () => {
  assert.equal(timeAgo("2026-11-03T11:58:00Z", now), "vor 2 Min.");
  assert.equal(timeAgo("2026-11-03T10:00:00Z", now), "vor 2 Std.");
  assert.equal(timeAgo("2026-11-02T11:00:00Z", now), "gestern");
});

test("timeAgo shows a date after a week", () => {
  assert.equal(timeAgo("2026-10-01T12:00:00Z", now), "01.10.2026");
});

test("timeAgo is empty for invalid input and never in the future", () => {
  assert.equal(timeAgo("nonsense", now), "");
  assert.equal(timeAgo("2026-11-03T12:05:00Z", now), "vor 1 Min.");
});

test("formatDay shows a calendar day with its weekday, independent of the time zone", () => {
  assert.equal(formatDay("2026-11-07"), "Sa., 7.11.");
  assert.equal(formatDay("2026-03-29"), "So., 29.3.");
  assert.equal(formatDay("bad"), "bad");
});
