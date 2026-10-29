import { test } from "node:test";
import assert from "node:assert/strict";
import { t } from "./t.ts";

test("returns the plain text without params", () => {
  assert.equal(t("undo"), "Rückgängig");
});

test("replaces placeholders", () => {
  assert.equal(t("solvedTextOther", { moves: 7 }), "Du hast das Rätsel mit 7 Zügen gelöst.");
});

test("leaves unknown placeholders untouched", () => {
  assert.equal(t("solvedTextOther", { other: 1 }), "Du hast das Rätsel mit {moves} Zügen gelöst.");
});
