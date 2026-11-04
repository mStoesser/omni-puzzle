import { test } from "node:test";
import assert from "node:assert/strict";
import { nonogramExamples } from "./examples.ts";
import { analyze, initState, isSolved, validate } from "./logic.ts";

test("there are 3 to 5 examples with unique ids", () => {
  assert.ok(nonogramExamples.length >= 3 && nonogramExamples.length <= 5);
  const ids = nonogramExamples.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
});

for (const { id, doc } of nonogramExamples) {
  test(`example ${id} is valid, has exactly one solution and no picture in its data`, () => {
    assert.equal(doc.type, "nonogram");
    assert.deepEqual(validate(doc.data), doc.data);
    assert.equal("image" in doc.data, false);
    assert.equal(isSolved(doc.data, initState(doc.data)), false);
    assert.equal(analyze(doc.data).status, "unique");
  });
}

test("examples are sorted by size", () => {
  const sizes = nonogramExamples.map((e) => e.doc.data.width * e.doc.data.height);
  assert.deepEqual(sizes, [...sizes].sort((a, b) => a - b));
});
