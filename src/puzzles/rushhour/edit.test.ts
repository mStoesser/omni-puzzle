import { test } from "node:test";
import assert from "node:assert/strict";
import { applyTool, blockAt, resize } from "./edit.ts";
import { createDefault, findProblems } from "./logic.ts";
import type { RushHourData } from "./logic.ts";

// Default: 6x6, target at (0,2)-(1,2), exit E row 2.
const base = createDefault();

test("block tools place a horizontal block on an empty cell", () => {
  const next = applyTool(base, "block3", 0, 0);
  assert.deepEqual(next.blocks.at(-1), { id: "b1", x: 0, y: 0, length: 3, axis: "h" });
  assert.deepEqual(findProblems(next), []);
});

test("block tools fall back to vertical when horizontal does not fit", () => {
  const next = applyTool(base, "block2", 5, 0); // x 5-6 would leave the board
  assert.deepEqual(next.blocks.at(-1), { id: "b1", x: 5, y: 0, length: 2, axis: "v" });
});

test("nothing is placed where no orientation fits", () => {
  const crowded: RushHourData = {
    ...base,
    blocks: [...base.blocks, { id: "a", x: 2, y: 1, length: 3, axis: "v" }, { id: "b", x: 3, y: 2, length: 2, axis: "h" }],
  };
  // (2,4) is free, horizontal 2 → (2,4),(3,4) fits; but (5,5) fits neither 3-long axis.
  assert.equal(applyTool(crowded, "block3", 5, 5), crowded);
});

test("tapping a block again rotates it if there is room", () => {
  const placed = applyTool(base, "block2", 3, 0);
  const rotated = applyTool(placed, "block2", 4, 0); // tap on the second cell
  assert.deepEqual(rotated.blocks.at(-1), { id: "b1", x: 3, y: 0, length: 2, axis: "v" });
  const back = applyTool(rotated, "block3", 3, 0);
  assert.equal(back.blocks.at(-1)!.axis, "h");
});

test("rotation is skipped if it would collide or leave the board", () => {
  const data = applyTool(base, "block2", 0, 1); // (0,1)-(1,1), rotating covers (0,2) = target
  assert.equal(applyTool(data, "block2", 0, 1), data);
  const edge = applyTool(base, "block2", 0, 5); // bottom row, vertical would leave the board
  assert.equal(applyTool(edge, "block2", 0, 5), edge);
});

test("eraser removes the tapped block and ignores empty cells", () => {
  const data = applyTool(base, "block2", 0, 0);
  assert.equal(applyTool(data, "erase", 1, 0).blocks.length, 1);
  assert.equal(applyTool(data, "erase", 4, 4), data);
});

test("target tool marks an existing block as the only target", () => {
  const data = applyTool(base, "block2", 0, 4);
  const next = applyTool(data, "target", 1, 4);
  assert.deepEqual(next.blocks.map((b) => !!b.target), [false, true]);
  assert.equal("target" in next.blocks[0]!, false);
});

test("target tool on an empty cell places a target along the exit axis", () => {
  const next = applyTool({ ...base, blocks: [], exit: { side: "S", index: 3 } }, "target", 3, 0);
  assert.deepEqual(next.blocks, [{ id: "b0", x: 3, y: 0, length: 2, axis: "v", target: true }]);
});

test("exit tool sets the exit from ring cells and ignores corners and inner cells", () => {
  assert.deepEqual(applyTool(base, "exit", 6, 4).exit, { side: "E", index: 4 });
  assert.deepEqual(applyTool(base, "exit", -1, 1).exit, { side: "W", index: 1 });
  assert.deepEqual(applyTool(base, "exit", 2, -1).exit, { side: "N", index: 2 });
  assert.deepEqual(applyTool(base, "exit", 5, 6).exit, { side: "S", index: 5 });
  assert.equal(applyTool(base, "exit", -1, -1), base);
  assert.equal(applyTool(base, "exit", 2, 2), base);
  assert.equal(applyTool(base, "exit", 6, 2), base); // unchanged exit
});

test("other tools ignore ring cells", () => {
  assert.equal(applyTool(base, "block2", -1, 0), base);
  assert.equal(applyTool(base, "erase", 6, 2), base);
});

test("new blocks get unique ids", () => {
  let data = base;
  for (const [x, y] of [[0, 0], [3, 0], [0, 4], [3, 4]] as const) data = applyTool(data, "block2", x, y);
  data = applyTool(data, "erase", 0, 0);
  data = applyTool(data, "block2", 0, 0);
  const ids = data.blocks.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("resize drops blocks outside and clamps the exit", () => {
  const data = applyTool(applyTool(base, "block2", 4, 5), "exit", 6, 5);
  const small = resize(data, 4, 5);
  assert.equal(small.width, 4);
  assert.equal(small.height, 5);
  assert.equal(small.blocks.length, 1);
  assert.deepEqual(small.exit, { side: "E", index: 4 });
});

test("resize clamps to the limits and is a no-op without change", () => {
  assert.equal(resize(base, 6, 6), base);
  assert.equal(resize(base, 1, 99).width, 3);
  assert.equal(resize(base, 1, 99).height, 12);
});

test("blockAt finds blocks by any of their cells", () => {
  assert.equal(blockAt(base, 1, 2), 0);
  assert.equal(blockAt(base, 2, 2), -1);
});
