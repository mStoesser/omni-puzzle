import { test } from "node:test";
import assert from "node:assert/strict";
import { rulesRegistry } from "../puzzles/rules.ts";
import { contrastProblems, parseTheme } from "./puzzle-theme.ts";
import { THEME_PRESETS } from "./theme-presets.ts";

test("every preset is a valid theme with a unique id", () => {
  assert.ok(THEME_PRESETS.length >= 4 && THEME_PRESETS.length <= 6);
  assert.equal(new Set(THEME_PRESETS.map((p) => p.id)).size, THEME_PRESETS.length);
  for (const preset of THEME_PRESETS) assert.deepEqual(parseTheme(preset.theme), preset.theme, preset.id);
});

test("every preset has enough contrast on every type that can be themed", () => {
  const themed = rulesRegistry.all().filter((type) => type.themeRoles);
  assert.ok(themed.length >= 8);
  for (const preset of THEME_PRESETS) {
    for (const type of themed) {
      const problems = contrastProblems(preset.theme, { roles: type.themeRoles!, fixed: type.themeFixed });
      assert.deepEqual(problems, [], `${preset.id} on ${type.id}`);
    }
  }
});
