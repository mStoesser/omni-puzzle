import { test } from "node:test";
import assert from "node:assert/strict";
import { parseShowTimer } from "./play-settings.ts";

test("the running time shows unless it was hidden", () => {
  assert.equal(parseShowTimer(null), true);
  assert.equal(parseShowTimer("hidden"), false);
  assert.equal(parseShowTimer("anything"), true);
});
