import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { examples, examplesIn, registry } from "./index.ts";
import { rulesRegistry } from "./rules.ts";

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
