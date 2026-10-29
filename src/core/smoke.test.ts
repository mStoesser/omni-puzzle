import { test } from "node:test";
import assert from "node:assert/strict";
import { de } from "../i18n/de.ts";

// Verifies that node --test runs TypeScript directly (type stripping, .ts imports).
test("node runs TypeScript tests without a build step", () => {
  const n: number = 1 + 1;
  assert.equal(n, 2);
  assert.equal(de.appTitle, "Rätsel");
});
