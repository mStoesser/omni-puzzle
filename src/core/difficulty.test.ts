import { test } from "node:test";
import assert from "node:assert/strict";
import { examples } from "../puzzles/index.ts";
import { rulesRegistry } from "../puzzles/rules.ts";
import { levelFromMoves, levelFromRating } from "./difficulty.ts";

test("levelFromMoves uses the type's thresholds", () => {
  const rush = rulesRegistry.get("rushhour")!;
  assert.deepEqual([3, 8, 9, 20, 21].map((m) => levelFromMoves(rush, m)), [1, 1, 2, 2, 3]);
  assert.equal(levelFromMoves(rulesRegistry.get("quiz")!, 3), null);
});

test("every type with a solver has levels", () => {
  for (const rules of rulesRegistry.all()) assert.equal(rules.solve !== undefined, rules.levels !== undefined, rules.id);
});

test("the examples span more than one level", () => {
  const levels = examples
    .filter((e) => e.doc.meta.minMoves !== undefined)
    .map((e) => levelFromMoves(rulesRegistry.get(e.doc.type)!, e.doc.meta.minMoves!));
  assert.ok(new Set(levels).size >= 2);
});

test("levelFromRating", () => {
  assert.deepEqual([1, 2.4, 2.5, 3.4, 3.5, 5].map(levelFromRating), [1, 1, 2, 2, 3, 3]);
});
