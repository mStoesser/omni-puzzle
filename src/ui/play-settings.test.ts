import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFeedback, parseShowTimer } from "./play-settings.ts";

test("the running time shows unless it was hidden", () => {
  assert.equal(parseShowTimer(null), true);
  assert.equal(parseShowTimer("hidden"), false);
  assert.equal(parseShowTimer("anything"), true);
});

test("sounds and vibration are off unless switched on", () => {
  assert.equal(parseFeedback(null), false);
  assert.equal(parseFeedback("on"), true);
  assert.equal(parseFeedback("yes"), false);
});
