import { test } from "node:test";
import assert from "node:assert/strict";
import { laserExamples } from "./examples.ts";
import { initState, isSolved, validate } from "./logic.ts";
import { solve } from "./solver.ts";

test("there are 3 to 5 examples with unique ids", () => {
  assert.ok(laserExamples.length >= 3 && laserExamples.length <= 5);
  const ids = laserExamples.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
});

for (const { id, doc } of laserExamples) {
  test(`example ${id} is valid, unsolved at the start, and its minMoves matches the solver`, () => {
    assert.equal(doc.type, "laser");
    assert.deepEqual(validate(doc.data), doc.data);
    assert.equal(isSolved(doc.data, initState(doc.data)), false);
    const result = solve(doc.data, { maxNodes: 1_000_000 });
    assert.equal(result.status, "solved");
    if (result.status === "solved") assert.equal(result.moves.length, doc.meta.minMoves);
  });
}

test("examples are sorted by difficulty", () => {
  const moves = laserExamples.map((e) => e.doc.meta.minMoves ?? 0);
  assert.deepEqual(moves, [...moves].sort((a, b) => a - b));
});
