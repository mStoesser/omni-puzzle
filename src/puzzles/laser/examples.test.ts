import { test } from "node:test";
import assert from "node:assert/strict";
import { laserExamples } from "./examples.ts";
import { initState, isSolved, minVersion, validate } from "./logic.ts";
import { solve } from "./solver.ts";

test("there are 3 to 5 basic examples plus one per extension, with unique ids", () => {
  assert.ok(laserExamples.length >= 3 && laserExamples.length <= 8);
  const ids = laserExamples.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
});

for (const { id, doc } of laserExamples) {
  test(`example ${id} is valid, unsolved at the start, and its minMoves matches the solver`, () => {
    assert.equal(doc.type, "laser");
    assert.deepEqual(validate(doc.data), doc.data);
    assert.equal(doc.typeVersion, minVersion(doc.data));
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

test("each extension has an example that needs it", () => {
  const versions = laserExamples.map((e) => e.doc.typeVersion);
  for (const version of [1, 2, 3, 4]) assert.ok(versions.includes(version), `version ${version}`);
});

test("the examples stay within the server's solver limit", () => {
  for (const { id, doc } of laserExamples) assert.equal(solve(doc.data, { maxNodes: 40_000 }).status, "solved", id);
});
