import { test } from "node:test";
import assert from "node:assert/strict";
import { applyTool, isTool, resize, setInventory } from "./edit.ts";
import { createDefault } from "./logic.ts";
import type { LaserData } from "./logic.ts";

const empty: LaserData = { width: 5, height: 4, cells: [] };

test("isTool accepts only known tools", () => {
  assert.ok(isTool("rotatable"));
  assert.ok(!isTool("block2"));
  assert.ok(!isTool(null));
});

test("places cells and keeps them sorted by row and column", () => {
  let data = applyTool(empty, "target", 3, 2);
  data = applyTool(data, "wall", 1, 0);
  data = applyTool(data, "mirror", 0, 2);
  assert.deepEqual(data.cells, [
    { x: 1, y: 0, cell: { kind: "wall" } },
    { x: 0, y: 2, cell: { kind: "mirror", orientation: "/", rotatable: false } },
    { x: 3, y: 2, cell: { kind: "target" } },
  ]);
  assert.deepEqual(empty.cells, [], "input is not mutated");
});

test("a new emitter points to the side with the most room", () => {
  assert.equal(emitterDir(applyTool(empty, "emitter", 0, 1)), "E");
  assert.equal(emitterDir(applyTool(empty, "emitter", 4, 1)), "W");
  assert.equal(emitterDir(applyTool(empty, "emitter", 2, 0)), "S");
  assert.equal(emitterDir(applyTool(empty, "emitter", 2, 3)), "N");
});

test("tapping again with the same tool turns emitters and mirrors", () => {
  let data = applyTool(empty, "emitter", 0, 1);
  data = applyTool(data, "emitter", 0, 1);
  assert.equal(emitterDir(data), "S");

  data = applyTool(empty, "rotatable", 2, 2);
  data = applyTool(data, "rotatable", 2, 2);
  assert.deepEqual(data.cells[0]!.cell, { kind: "mirror", orientation: "\\", rotatable: true });

  const wall = applyTool(empty, "wall", 1, 1);
  assert.equal(applyTool(wall, "wall", 1, 1), wall, "walls do not turn");
});

test("another tool replaces the content; mirrors keep their orientation when switching kind", () => {
  let data = applyTool(applyTool(empty, "mirror", 2, 2), "mirror", 2, 2); // fixed "\"
  data = applyTool(data, "rotatable", 2, 2);
  assert.deepEqual(data.cells, [{ x: 2, y: 2, cell: { kind: "mirror", orientation: "\\", rotatable: true } }]);
  data = applyTool(data, "target", 2, 2);
  assert.deepEqual(data.cells, [{ x: 2, y: 2, cell: { kind: "target" } }]);
});

test("erase removes a cell; taps outside the board change nothing", () => {
  const data = createDefault();
  assert.equal(applyTool(data, "erase", 4, 1).cells.length, data.cells.length - 1);
  assert.equal(applyTool(data, "erase", 2, 2), data);
  assert.equal(applyTool(data, "wall", -1, 0), data);
  assert.equal(applyTool(data, "wall", data.width, 0), data);
});

test("resize clamps the size and drops cells outside", () => {
  const data = createDefault(); // 6x6 with cells at (0,1), (4,1), (4,4)
  const smaller = resize(data, 4, 4);
  assert.deepEqual([smaller.width, smaller.height], [4, 4]);
  assert.deepEqual(smaller.cells, [data.cells[0]]);
  assert.deepEqual([resize(data, 1, 99).width, resize(data, 1, 99).height], [3, 12]);
  assert.equal(resize(data, 6, 6), data);
});

function emitterDir(data: LaserData) {
  const cell = data.cells.find((c) => c.cell.kind === "emitter")?.cell;
  return cell?.kind === "emitter" ? cell.dir : null;
}

test("resize keeps the inventory", () => {
  assert.equal(resize({ ...createDefault(), inventory: 2 }, 4, 4).inventory, 2);
});

test("setInventory clamps the count and removes the field at 0", () => {
  const data = createDefault();
  assert.equal(setInventory(data, 2).inventory, 2);
  assert.equal(setInventory(data, 9).inventory, 3);
  assert.ok(!("inventory" in setInventory(setInventory(data, 2), 0)));
  assert.equal(setInventory(data, 0), data);
});

test("splitters are placed and turned like mirrors and keep the orientation when switching", () => {
  let data = applyTool(empty, "rotatableSplitter", 1, 1);
  assert.deepEqual(data.cells[0]!.cell, { kind: "splitter", orientation: "/", rotatable: true });
  data = applyTool(data, "rotatableSplitter", 1, 1);
  data = applyTool(data, "splitter", 1, 1);
  assert.deepEqual(data.cells[0]!.cell, { kind: "splitter", orientation: "\\", rotatable: false });
  data = applyTool(data, "mirror", 1, 1);
  assert.deepEqual(data.cells[0]!.cell, { kind: "mirror", orientation: "\\", rotatable: false });
});

test("filters start red, and the filter tool cycles their color", () => {
  let data = applyTool(empty, "filter", 2, 2);
  assert.deepEqual(data.cells[0]!.cell, { kind: "filter", color: "red" });
  data = applyTool(data, "filter", 2, 2);
  assert.deepEqual(data.cells[0]!.cell, { kind: "filter", color: "green" });
});

test("the color tool cycles lasers, targets and filters and leaves other cells alone", () => {
  let data = applyTool(empty, "emitter", 0, 0);
  const colors = [];
  for (let i = 0; i < 3; i++) {
    data = applyTool(data, "color", 0, 0);
    colors.push(JSON.stringify(data.cells[0]!.cell));
  }
  assert.deepEqual(colors, [
    JSON.stringify({ kind: "emitter", dir: "E", color: "green" }),
    JSON.stringify({ kind: "emitter", dir: "E", color: "blue" }),
    JSON.stringify({ kind: "emitter", dir: "E" }),
  ]);

  let target = applyTool(empty, "target", 1, 1);
  const targets = [];
  for (let i = 0; i < 4; i++) {
    target = applyTool(target, "color", 1, 1);
    targets.push(target.cells[0]!.cell.kind === "target" ? target.cells[0]!.cell.color : "?");
  }
  assert.deepEqual(targets, ["red", "green", "blue", undefined]);

  const wall = applyTool(empty, "wall", 1, 1);
  assert.equal(applyTool(wall, "color", 1, 1), wall);
  assert.equal(applyTool(empty, "color", 1, 1), empty);
});
