import { test } from "node:test";
import assert from "node:assert/strict";
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
