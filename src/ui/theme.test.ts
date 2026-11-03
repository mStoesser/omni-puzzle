import assert from "node:assert/strict";
import { test } from "node:test";
import { parseTheme } from "./theme.ts";

test("parseTheme defaults to dark", () => {
  assert.equal(parseTheme(null), "dark");
  assert.equal(parseTheme(""), "dark");
  assert.equal(parseTheme("blue"), "dark");
});

test("parseTheme keeps valid choices", () => {
  assert.equal(parseTheme("dark"), "dark");
  assert.equal(parseTheme("light"), "light");
  assert.equal(parseTheme("system"), "system");
});
