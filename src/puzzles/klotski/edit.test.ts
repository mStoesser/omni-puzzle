import { test } from "node:test";
import assert from "node:assert/strict";
import { applyTool, blockAt, resize } from "./edit.ts";
import { createDefault, findProblems } from "./logic.ts";
import type { KlotskiData } from "./logic.ts";

// Default: 4×5, 2×2 target at (1,0), exit S at columns 1-2.
const base = createDefault();

test("size tools place a block with its top-left cell on the tapped cell", () => {
  const next = applyTool(base, "block12", 0, 0);
  assert.deepEqual(next.blocks.at(-1), { id: "b1", x: 0, y: 0, w: 1, h: 2 });
  assert.deepEqual(applyTool(base, "block21", 0, 3).blocks.at(-1), { id: "b1", x: 0, y: 3, w: 2, h: 1 });
  assert.deepEqual(findProblems(next), []);
});

test("a block that does not fit at the tapped cell is shifted up or left to cover it", () => {
  assert.deepEqual(applyTool(base, "block22", 3, 4).blocks.at(-1), { id: "b1", x: 2, y: 3, w: 2, h: 2 });
  assert.deepEqual(applyTool(base, "block21", 3, 2).blocks.at(-1), { id: "b1", x: 2, y: 2, w: 2, h: 1 });
});

test("nothing is placed where the block does not fit", () => {
  assert.equal(applyTool(base, "block22", 0, 1), base); // column 0 is too narrow beside the target
  const full = applyTool(base, "block11", 0, 0);
  assert.equal(applyTool(full, "block22", 0, 0), full); // (0,0) is taken: resizing the 1×1 to 2×2 collides
});

test("a size tool on a block changes its size if it fits", () => {
  const data = applyTool(base, "block11", 0, 2);
  assert.deepEqual(applyTool(data, "block21", 0, 2).blocks.at(-1), { id: "b1", x: 0, y: 2, w: 2, h: 1 });
  assert.equal(applyTool(data, "block11", 0, 2), data);
  const edge = applyTool(base, "block11", 3, 4);
  assert.equal(applyTool(edge, "block21", 3, 4), edge); // would leave the board
});

test("eraser removes the tapped block and ignores empty cells", () => {
  const data = applyTool(base, "block12", 0, 0);
  assert.equal(applyTool(data, "erase", 0, 1).blocks.length, 1);
  assert.equal(applyTool(data, "erase", 3, 4), data);
});

test("target tool marks an existing block as the only target", () => {
  const data = applyTool(base, "block21", 0, 4);
  const next = applyTool(data, "target", 1, 4);
  assert.deepEqual(next.blocks.map((b) => !!b.target), [false, true]);
  assert.equal("target" in next.blocks[0]!, false);
  assert.equal(applyTool(next, "target", 0, 4), next);
});

test("target tool on an empty cell places the largest target that fits", () => {
  const empty: KlotskiData = { ...base, blocks: [] };
  assert.deepEqual(applyTool(empty, "target", 3, 4).blocks, [{ id: "b0", x: 2, y: 3, w: 2, h: 2, target: true }]);
  const crowded = applyTool(applyTool(base, "block12", 0, 2), "block12", 1, 2);
  // Column 3 next to the target: only 1 wide → a 1×2 target, the old one is no target anymore.
  const next = applyTool(crowded, "target", 3, 0);
  assert.deepEqual(next.blocks.at(-1), { id: "b3", x: 3, y: 0, w: 1, h: 2, target: true });
  assert.equal(next.blocks.filter((b) => b.target).length, 1);
});

test("exit tool sets the exit from ring cells, as far along as it fits", () => {
  assert.deepEqual(applyTool(base, "exit", 0, 5).exit, { side: "S", index: 0 });
  assert.deepEqual(applyTool(base, "exit", 3, 5).exit, { side: "S", index: 2 }); // 2 wide: columns 2-3
  assert.deepEqual(applyTool(base, "exit", 4, 1).exit, { side: "E", index: 1 });
  assert.deepEqual(applyTool(base, "exit", -1, 4).exit, { side: "W", index: 3 });
  assert.deepEqual(applyTool(base, "exit", 2, -1).exit, { side: "N", index: 2 });
  assert.equal(applyTool(base, "exit", -1, -1), base); // corner
  assert.equal(applyTool(base, "exit", 2, 2), base); // inner cell
  assert.equal(applyTool(base, "exit", 1, 5), base); // unchanged
});

test("making a wider block the target moves the exit back so it still fits", () => {
  const data: KlotskiData = { ...base, blocks: [{ id: "a", x: 0, y: 0, w: 1, h: 1, target: true }], exit: { side: "S", index: 3 } };
  const wide = applyTool(data, "block21", 0, 0);
  assert.deepEqual(wide.exit, { side: "S", index: 2 });
  assert.deepEqual(findProblems(wide), []);
});

test("other tools ignore ring cells", () => {
  assert.equal(applyTool(base, "block11", -1, 0), base);
  assert.equal(applyTool(base, "erase", 1, 5), base);
});

test("new blocks get unique ids", () => {
  let data = base;
  for (const [x, y] of [[0, 0], [3, 0], [0, 3], [3, 3]] as const) data = applyTool(data, "block11", x, y);
  data = applyTool(data, "erase", 0, 0);
  data = applyTool(data, "block11", 0, 0);
  const ids = data.blocks.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("resize drops blocks outside and clamps the exit", () => {
  const data = applyTool(applyTool(base, "block11", 3, 4), "exit", 4, 3); // exit E rows 3-4
  const small = resize(data, 3, 4);
  assert.equal(small.width, 3);
  assert.equal(small.height, 4);
  assert.equal(small.blocks.length, 1);
  assert.deepEqual(small.exit, { side: "E", index: 2 });
});

test("resize clamps to the limits and is a no-op without change", () => {
  assert.equal(resize(base, 4, 5), base);
  assert.equal(resize(base, 1, 99).width, 3);
  assert.equal(resize(base, 1, 99).height, 10);
});

test("blockAt finds blocks by any of their cells", () => {
  assert.equal(blockAt(base, 2, 1), 0);
  assert.equal(blockAt(base, 0, 0), -1);
});
