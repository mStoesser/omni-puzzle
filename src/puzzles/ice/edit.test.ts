import { test } from "node:test";
import assert from "node:assert/strict";
import { applyTool, isTool, resize } from "./edit.ts";
import type { IceData } from "./logic.ts";

const base = (): IceData => ({
  width: 4,
  height: 4,
  cells: [
    { x: 0, y: 0, kind: "start" },
    { x: 3, y: 3, kind: "goal" },
  ],
});

test("placing a kind adds or replaces the cell, keeping cells sorted", () => {
  const walled = applyTool(base(), "wall", 2, 1);
  assert.deepEqual(walled.cells, [
    { x: 0, y: 0, kind: "start" },
    { x: 2, y: 1, kind: "wall" },
    { x: 3, y: 3, kind: "goal" },
  ]);
  const sand = applyTool(walled, "sand", 2, 1);
  assert.deepEqual(sand.cells[1], { x: 2, y: 1, kind: "sand" });
  assert.equal(sand.cells.length, 3);
});

test("placing the same kind again changes nothing (same object)", () => {
  const walled = applyTool(base(), "wall", 2, 1);
  assert.equal(applyTool(walled, "wall", 2, 1), walled);
});

test("there is only one start: placing it moves it", () => {
  const moved = applyTool(base(), "start", 1, 2);
  assert.deepEqual(
    moved.cells.filter((c) => c.kind === "start"),
    [{ x: 1, y: 2, kind: "start" }],
  );
});

test("the start can replace the goal and the other way round", () => {
  const data = applyTool(base(), "start", 3, 3);
  assert.deepEqual(data.cells, [{ x: 3, y: 3, kind: "start" }]);
  assert.deepEqual(applyTool(data, "goal", 3, 3).cells, [{ x: 3, y: 3, kind: "goal" }]);
});

test("erase removes a cell; erasing empty ice or outside the board changes nothing", () => {
  const data = base();
  assert.deepEqual(applyTool(data, "erase", 3, 3).cells, [{ x: 0, y: 0, kind: "start" }]);
  assert.equal(applyTool(data, "erase", 1, 1), data);
  assert.equal(applyTool(data, "wall", 4, 0), data);
  assert.equal(applyTool(data, "wall", -1, 0), data);
});

test("tools do not mutate the data", () => {
  const data = base();
  const copy = structuredClone(data);
  applyTool(data, "wall", 1, 1);
  applyTool(data, "start", 2, 2);
  applyTool(data, "erase", 0, 0);
  assert.deepEqual(data, copy);
});

test("resize clamps and drops cells outside", () => {
  const small = resize(base(), 3, 3);
  assert.deepEqual(small, { width: 3, height: 3, cells: [{ x: 0, y: 0, kind: "start" }] });
  assert.deepEqual(resize(base(), 1, 99), { width: 3, height: 14, cells: [{ x: 0, y: 0, kind: "start" }] });
  const same = base();
  assert.equal(resize(same, 4, 4), same);
});

test("isTool", () => {
  assert.equal(isTool("sand"), true);
  assert.equal(isTool("lava"), false);
});
