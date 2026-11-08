import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SAVED_THEME_LIMITS,
  addSavedTheme,
  cleanThemeName,
  parseSavedThemes,
  removeSavedTheme,
  renameSavedTheme,
} from "./saved-themes.ts";
import { THEME_PRESETS } from "./theme-presets.ts";

const theme = THEME_PRESETS[0]!.theme;

test("cleanThemeName trims, collapses spaces and limits the length", () => {
  assert.equal(cleanThemeName("  Mein   Wald "), "Mein Wald");
  assert.equal(cleanThemeName("   "), null);
  assert.equal(cleanThemeName("x".repeat(SAVED_THEME_LIMITS.maxName + 1)), null);
});

test("parseSavedThemes keeps valid entries and skips broken ones and duplicate ids", () => {
  const list = parseSavedThemes([
    { id: "a", name: "Wald", theme },
    { id: "a", name: "Doppelt", theme },
    { id: "b", name: "", theme },
    { id: "c", name: "Kaputt", theme: { colors: { board: "red" } } },
    "x",
    { id: "d", name: " Meer ", theme, extra: 1 },
  ]);
  assert.deepEqual(list, [{ id: "a", name: "Wald", theme }, { id: "d", name: "Meer", theme }]);
  assert.deepEqual(parseSavedThemes(undefined), []);
  assert.deepEqual(parseSavedThemes({ id: "a" }), []);
});

test("add, rename and remove return new lists", () => {
  const empty: never[] = [];
  const added = addSavedTheme(empty, "a", " Wald ", theme);
  assert.deepEqual(added, { list: [{ id: "a", name: "Wald", theme }] });
  assert.equal(empty.length, 0);
  assert.equal(addSavedTheme(added.list, "b", " ", theme).error, "name");
  assert.deepEqual(renameSavedTheme(added.list, "a", "Forst").list[0]!.name, "Forst");
  assert.equal(renameSavedTheme(added.list, "a", "").error, "name");
  assert.deepEqual(removeSavedTheme(added.list, "a"), []);
});

test("the list has a maximum length", () => {
  let list = parseSavedThemes([]);
  for (let i = 0; i < SAVED_THEME_LIMITS.maxThemes; i++) list = addSavedTheme(list, `t${i}`, `T${i}`, theme).list;
  const full = addSavedTheme(list, "x", "X", theme);
  assert.equal(full.error, "full");
  assert.equal(full.list.length, SAVED_THEME_LIMITS.maxThemes);
});
