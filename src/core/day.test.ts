import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, isDay } from "./day.ts";

test("isDay accepts real calendar days only", () => {
  assert.ok(isDay("2026-11-07"));
  assert.ok(isDay("2028-02-29"));
  for (const bad of ["2026-02-30", "2026-13-01", "2026-1-07", "07.11.2026", "", 20261107, null]) assert.ok(!isDay(bad), String(bad));
});

test("addDays crosses months, years and leap days", () => {
  assert.equal(addDays("2026-11-07", 1), "2026-11-08");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(addDays("2028-03-01", -1), "2028-02-29");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-03-29", 1), "2026-03-30", "daylight saving time does not matter");
});
