import { test } from "node:test";
import assert from "node:assert/strict";
import { rushHourExamples } from "./examples.ts";
import { validate } from "./logic.ts";
import { solve } from "./solver.ts";

test("there are 3 to 5 examples with unique ids", () => {
  assert.ok(rushHourExamples.length >= 3 && rushHourExamples.length <= 5);
  const ids = rushHourExamples.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
});

for (const { id, doc } of rushHourExamples) {
  test(`example ${id} is valid and its minMoves matches the solver`, () => {
    assert.equal(doc.type, "rushhour");
    assert.deepEqual(validate(doc.data), doc.data);
    const result = solve(doc.data, { maxNodes: 1_000_000 });
    assert.equal(result.status, "solved");
    if (result.status === "solved") assert.equal(result.moves.length, doc.meta.minMoves);
  });
}

test("examples are sorted by difficulty", () => {
  const moves = rushHourExamples.map((e) => e.doc.meta.minMoves ?? 0);
  assert.deepEqual(moves, [...moves].sort((a, b) => a - b));
});
