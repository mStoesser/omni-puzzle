import { test } from "node:test";
import assert from "node:assert/strict";
import { DIRS, inBounds, isDir, opposite, pointKey, rotate, rotateCCW, rotateCW, step } from "./grid.ts";

test("DIRS is clockwise starting north", () => {
  assert.deepEqual(DIRS, ["N", "E", "S", "W"]);
});

test("step follows the deltas, y grows downwards", () => {
  const p = { x: 2, y: 2 };
  assert.deepEqual(step(p, "N"), { x: 2, y: 1 });
  assert.deepEqual(step(p, "E"), { x: 3, y: 2 });
  assert.deepEqual(step(p, "S"), { x: 2, y: 3 });
  assert.deepEqual(step(p, "W"), { x: 1, y: 2 });
  assert.deepEqual(step(p, "E", 3), { x: 5, y: 2 });
  assert.deepEqual(step(p, "N", -1), { x: 2, y: 3 });
});

test("rotateCW and rotateCCW", () => {
  assert.equal(rotateCW("N"), "E");
  assert.equal(rotateCW("W"), "N");
  assert.equal(rotateCCW("N"), "W");
  assert.equal(rotateCCW("E"), "N");
});

test("rotate handles multiple and negative turns", () => {
  assert.equal(rotate("N", 0), "N");
  assert.equal(rotate("N", 5), "E");
  assert.equal(rotate("N", -6), "S");
  for (const d of DIRS) assert.equal(rotate(rotate(d, 3), -3), d);
});

test("opposite", () => {
  assert.equal(opposite("N"), "S");
  assert.equal(opposite("E"), "W");
  for (const d of DIRS) assert.equal(opposite(opposite(d)), d);
});

test("inBounds checks all four edges", () => {
  assert.equal(inBounds({ x: 0, y: 0 }, 3, 2), true);
  assert.equal(inBounds({ x: 2, y: 1 }, 3, 2), true);
  assert.equal(inBounds({ x: -1, y: 0 }, 3, 2), false);
  assert.equal(inBounds({ x: 0, y: -1 }, 3, 2), false);
  assert.equal(inBounds({ x: 3, y: 0 }, 3, 2), false);
  assert.equal(inBounds({ x: 0, y: 2 }, 3, 2), false);
});

test("isDir and pointKey", () => {
  assert.equal(isDir("S"), true);
  assert.equal(isDir("X"), false);
  assert.equal(isDir(null), false);
  assert.equal(pointKey({ x: 3, y: 4 }), "3,4");
});
