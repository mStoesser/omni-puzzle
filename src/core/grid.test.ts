import { test } from "node:test";
import assert from "node:assert/strict";
import { DIRS, inBounds, isDir, keyDir, lineCells, opposite, pointKey, rotate, rotateCCW, rotateCW, step, swipeDir } from "./grid.ts";

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

test("swipeDir picks the dominant axis", () => {
  assert.equal(swipeDir(40, 5, 24), "E");
  assert.equal(swipeDir(-40, 30, 24), "W");
  assert.equal(swipeDir(3, 50, 24), "S");
  assert.equal(swipeDir(-10, -25, 24), "N");
});

test("swipeDir ignores short and exactly diagonal swipes", () => {
  assert.equal(swipeDir(20, 10, 24), null);
  assert.equal(swipeDir(0, 0, 24), null);
  assert.equal(swipeDir(30, -30, 24), null);
  assert.equal(swipeDir(24, 0, 24), "E"); // the minimum itself counts
});

test("keyDir maps arrow keys and WASD", () => {
  assert.equal(keyDir("ArrowUp"), "N");
  assert.equal(keyDir("ArrowRight"), "E");
  assert.equal(keyDir("ArrowDown"), "S");
  assert.equal(keyDir("ArrowLeft"), "W");
  assert.equal(keyDir("w"), "N");
  assert.equal(keyDir("A"), "W"); // caps lock or shift
  assert.equal(keyDir("s"), "S");
  assert.equal(keyDir("d"), "E");
  assert.equal(keyDir("Enter"), null);
  assert.equal(keyDir("x"), null);
});

test("lineCells: straight lines and the same cell", () => {
  assert.deepEqual(lineCells({ x: 1, y: 1 }, { x: 1, y: 1 }), []);
  assert.deepEqual(lineCells({ x: 0, y: 0 }, { x: 3, y: 0 }), [
    { x: 1, y: 0 },
    { x: 2, y: 0 },
    { x: 3, y: 0 },
  ]);
  assert.deepEqual(lineCells({ x: 2, y: 2 }, { x: 2, y: 0 }), [
    { x: 2, y: 1 },
    { x: 2, y: 0 },
  ]);
});

test("lineCells: diagonal lines have no gaps and end at the target", () => {
  for (const [from, to] of [
    [{ x: 0, y: 0 }, { x: 3, y: 3 }],
    [{ x: 5, y: 1 }, { x: 0, y: 3 }],
    [{ x: 0, y: 4 }, { x: 1, y: 0 }],
  ] as const) {
    const cells = lineCells(from, to);
    assert.deepEqual(cells.at(-1), to);
    assert.equal(cells.length, Math.abs(to.x - from.x) + Math.abs(to.y - from.y));
    let prev: { x: number; y: number } = from;
    for (const cell of cells) {
      assert.equal(Math.abs(cell.x - prev.x) + Math.abs(cell.y - prev.y), 1, "orthogonal neighbours");
      prev = cell;
    }
  }
});
