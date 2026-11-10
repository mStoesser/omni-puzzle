import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { examples, examplesIn, registry } from "./index.ts";
import { rulesRegistry } from "./rules.ts";
import { THEME_PRESETS } from "../core/theme-presets.ts";
import { paletteRoles } from "../ui/palette.ts";
import type { Palette } from "../ui/palette.ts";
import { PALETTE as ice } from "./ice/render.ts";
import { PALETTE as klotski } from "./klotski/render.ts";
import { PALETTE as laser } from "./laser/render.ts";
import { PALETTE as lightsout } from "./lightsout/render.ts";
import { EDIT_PALETTE as nonogramEdit, PALETTE as nonogram } from "./nonogram/render.ts";
import { PALETTE as pipes } from "./pipes/render.ts";
import { PALETTE as rushhour } from "./rushhour/render.ts";
import { PALETTE as sokoban } from "./sokoban/render.ts";

test("every puzzle type has its rules registered for the server", () => {
  const ids = (list: readonly { id: string; version: number }[]) => list.map((t) => `${t.id}@${t.version}`).sort();
  assert.deepEqual(ids(rulesRegistry.all()), ids(registry.all()));
  for (const type of registry.all()) {
    const rules = rulesRegistry.get(type.id)!;
    assert.equal(rules.validate, type.validate, type.id);
    assert.equal(rules.solve, type.solve, type.id);
    assert.equal(rules.migrate, type.migrate, type.id);
    assert.equal(rules.minVersion, type.minVersion, type.id);
    assert.equal(rules.ranking, type.ranking, type.id);
    assert.equal(rules.themeRoles, type.themeRoles, type.id);
    assert.equal(rules.themeFixed, type.themeFixed, type.id);
    assert.equal(rules.iconRoles, type.iconRoles, type.id);
  }
});

test("each renderer's palette takes exactly the theme roles its rules report", () => {
  // The contrast check (also on the server) only tests pairs of these roles.
  const palettes: Record<string, Palette[]> = {
    ice: [ice], klotski: [klotski], laser: [laser], lightsout: [lightsout], nonogram: [nonogram, nonogramEdit],
    pipes: [pipes], rushhour: [rushhour], sokoban: [sokoban],
  };
  for (const type of rulesRegistry.all()) {
    const list = palettes[type.id];
    if (!list) {
      assert.equal(type.themeRoles, undefined, `${type.id} has no palette, so it cannot be themed`);
      continue;
    }
    const used = new Set(list.flatMap(paletteRoles));
    assert.deepEqual([...used].sort(), [...type.themeRoles!].sort(), type.id);
  }
});

test("every theme role (and the rules' fixed colors) has a name in the theme editor", () => {
  for (const type of registry.all()) {
    if (!type.themeRoles) {
      assert.equal(type.themeParts, undefined, type.id);
      continue;
    }
    const named = Object.keys(type.themeParts ?? {}).sort();
    const needed = [...type.themeRoles, ...(type.themeFixed ? ["fixed"] : [])].sort();
    assert.deepEqual(named, needed, type.id);
  }
});

test("the puzzle of the day skips exactly the types without a leaderboard", () => {
  // pick_daily() and mod_plan_daily() list them, because the database does not know the rules.
  const sql = readFileSync(new URL("../../supabase/migrations/0011_daily.sql", import.meta.url), "utf8");
  const lists = [...sql.matchAll(/p\.type <> all \(array\[([^\]]*)\]\)/g)].map((m) => m[1]!.replaceAll("'", "").split(/,\s*/).sort());
  const unranked = rulesRegistry.all().filter((t) => !t.ranking).map((t) => t.id).sort();
  assert.equal(lists.length, 2);
  for (const list of lists) assert.deepEqual(list, unranked, "update 0011_daily.sql in a new migration");
});

test("types with a board have a card preview, and the server sends preview data for exactly those", () => {
  for (const type of registry.all()) assert.equal(typeof type.renderPreview === "function", Boolean(type.themeRoles), type.id);
  const sql = readFileSync(new URL("../../supabase/migrations/0014_preview.sql", import.meta.url), "utf8");
  const lists = [...sql.matchAll(/p\.type <> all \(array\[([^\]]*)\]\)/g)].map((m) => m[1]!.replaceAll("'", "").split(/,\s*/).sort());
  const boardless = registry.all().filter((t) => !t.themeRoles).map((t) => t.id).sort();
  assert.equal(lists.length, 1);
  assert.deepEqual(lists[0], boardless, "update 0014_preview.sql in a new migration");
});

test("every card preview draws the examples' starting positions, with and without a theme", () => {
  const theme = THEME_PRESETS[0]!.theme;
  for (const { id, doc } of examples) {
    const type = registry.get(doc.type)!;
    if (!type.renderPreview) continue;
    assert.ok(type.renderPreview(doc.data, undefined), id);
    assert.ok(type.renderPreview(doc.data, theme), id);
  }
});

test("examples have a title in every language; written ones are listed only in their language", () => {
  for (const e of examples) {
    assert.ok(e.title || e.lang, `${e.id}: title per language or one language`);
    if (e.lang) assert.equal(e.doc.meta.lang, e.lang, e.id);
    if (e.title) assert.equal(e.title.de, e.doc.meta.title, e.id);
  }
  const en = examplesIn("en");
  assert.equal(en.find((e) => e.id === "rushhour-1")?.doc.meta.title, "First Exit");
  assert.ok(!en.some((e) => e.id === "quiz-1") && en.some((e) => e.id === "quiz-en-1"));
  const de = examplesIn("de");
  assert.ok(de.some((e) => e.id === "quiz-1") && !de.some((e) => e.id === "quiz-en-1"));
  assert.equal(de.length, en.length);
  assert.equal(examplesIn("en", "all").length, examples.length);
  // Translated titles do not change what counts as the same puzzle.
  assert.equal(examplesIn("en", "all")[0]!.doc.data, examples[0]!.doc.data);
});
