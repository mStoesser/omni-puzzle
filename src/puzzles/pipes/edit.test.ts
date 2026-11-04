import { test } from "node:test";
import assert from "node:assert/strict";
import { applyTool, connect, drawPath, resize, scramble } from "./edit.ts";
import { initState, isSolved } from "./logic.ts";
import type { PipesData } from "./logic.ts";

const empty: PipesData = { rows: ["000", "000", "000"], source: { x: 0, y: 0 }, fixed: [] };

test("drawPath lays pipes between consecutive neighbours", () => {
  const data = drawPath(empty, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }]);
  // (0,0) E; (1,0) W+S; (1,1) N+E; (2,1) W.
  assert.deepEqual(data.rows, ["2c0", "038", "000"]);
  assert.equal(isSolved(data, initState(data)), true);
});

test("drawPath skips steps between cells that are not neighbours", () => {
  assert.deepEqual(drawPath(empty, [{ x: 0, y: 0 }, { x: 2, y: 0 }]).rows, empty.rows);
  assert.deepEqual(drawPath(empty, [{ x: 0, y: 0 }, { x: 1, y: 1 }]).rows, empty.rows);
  assert.equal(drawPath(empty, [{ x: 0, y: 0 }]), empty);
});

test("connect adds to existing pipes and is a no-op for existing connections and outside cells", () => {
  const line = connect(empty, { x: 0, y: 1 }, { x: 1, y: 1 });
  const tee = connect(line, { x: 1, y: 1 }, { x: 1, y: 2 });
  assert.deepEqual(tee.rows, ["000", "2c0", "010"]);
  assert.equal(connect(tee, { x: 1, y: 1 }, { x: 1, y: 2 }), tee);
  assert.equal(connect(tee, { x: 2, y: 1 }, { x: 3, y: 1 }), tee);
});

test("source moves the source; turn turns one tile clockwise", () => {
  const data = drawPath(empty, [{ x: 0, y: 0 }, { x: 1, y: 0 }]);
  assert.deepEqual(applyTool(data, "source", 1, 0).source, { x: 1, y: 0 });
  assert.equal(applyTool(data, "source", 0, 0), data);
  assert.deepEqual(applyTool(data, "turn", 0, 0).rows[0], "480");
  assert.equal(applyTool(data, "turn", 2, 2), data); // empty
});

test("fixed toggles on tiles only", () => {
  const data = drawPath(empty, [{ x: 0, y: 0 }, { x: 1, y: 0 }]);
  const fixed = applyTool(applyTool(data, "fixed", 1, 0), "fixed", 0, 0);
  assert.deepEqual(fixed.fixed, [0, 1]);
  assert.deepEqual(applyTool(fixed, "fixed", 0, 0).fixed, [1]);
  assert.equal(applyTool(data, "fixed", 2, 2), data);
});

test("erase removes the tile, the pipe ends leading into it and its fixed mark", () => {
  let data = drawPath(empty, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }]);
  data = applyTool(data, "fixed", 1, 0);
  const erased = applyTool(data, "erase", 1, 0);
  assert.deepEqual(erased.rows, ["000", "000", "000"]);
  assert.deepEqual(erased.fixed, []);
  assert.equal(applyTool(erased, "erase", 1, 1), erased);
});

test("tap tools ignore cells outside the board", () => {
  for (const tool of ["source", "turn", "fixed", "erase"] as const) assert.equal(applyTool(empty, tool, 3, 0), empty);
});

test("scramble turns turnable tiles and leaves fixed tiles, crosses and empty cells", () => {
  let data = drawPath(empty, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }]);
  data = applyTool(data, "fixed", 0, 0);
  // Rows before: "2ac", "001". One quarter turn each, except the fixed tile at (0,0).
  assert.deepEqual(scramble(data, () => 0.3).rows, ["259", "002", "000"]);
  assert.deepEqual(scramble(data, () => 0).rows, data.rows);
});

test("resize cuts and pads with empty cells and keeps source and fixed tiles in place", () => {
  const data: PipesData = { rows: ["2a8", "000", "000"], source: { x: 2, y: 0 }, fixed: [1, 2] };
  const wide = resize(data, 4, 3);
  assert.deepEqual(wide.rows, ["2a80", "0000", "0000"]);
  assert.deepEqual(wide.fixed, [1, 2]);
  const fixedLow: PipesData = { ...data, fixed: [4] }; // (1,1)
  assert.deepEqual(resize(fixedLow, 4, 4).fixed, [5]);
  const narrow = resize(wide, 3, 3);
  assert.deepEqual(narrow.rows, data.rows);
  assert.equal(resize(data, 3, 3), data);
  const cut = resize({ ...data, rows: ["2a80", "0000", "0000"], fixed: [3] }, 3, 3);
  assert.deepEqual(cut.fixed, []);
  assert.deepEqual(resize({ ...data, rows: ["2a80", "0000", "0000"], source: { x: 3, y: 0 } }, 3, 3).source, { x: 2, y: 0 });
});
