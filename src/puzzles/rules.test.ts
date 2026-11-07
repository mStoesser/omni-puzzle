import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registry } from "./index.ts";
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
