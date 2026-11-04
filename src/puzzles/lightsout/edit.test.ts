import { test } from "node:test";
import assert from "node:assert/strict";
import { applyTool, resize } from "./edit.ts";
import type { LightsOutData } from "./logic.ts";
import { solve } from "./solver.ts";

const base: LightsOutData = { rows: ["...", ".*.", "..#"] };

test("light switches one light and turns a hole into a lit cell", () => {
  assert.deepEqual(applyTool(base, "light", 0, 0).rows, ["*..", ".*.", "..#"]);
  assert.deepEqual(applyTool(base, "light", 1, 1).rows, ["...", "...", "..#"]);
  assert.deepEqual(applyTool(base, "light", 2, 2).rows, ["...", ".*.", "..*"]);
});

test("press toggles like a game move and ignores holes", () => {
  assert.deepEqual(applyTool(base, "press", 1, 1).rows, [".*.", "*.*", ".*#"]);
  assert.deepEqual(applyTool(base, "press", 2, 1).rows, ["..*", "..*", "..#"]); // (1,1) goes off, (2,2) is a hole
  assert.equal(applyTool(base, "press", 2, 2), base);
});

test("hole and eraser set the cell and are no-ops if nothing changes", () => {
  assert.deepEqual(applyTool(base, "hole", 1, 1).rows, ["...", ".#.", "..#"]);
  assert.deepEqual(applyTool(base, "erase", 2, 2).rows, ["...", ".*.", "..."]);
  assert.deepEqual(applyTool(base, "erase", 1, 1).rows, ["...", "...", "..#"]);
  assert.equal(applyTool(base, "hole", 2, 2), base);
  assert.equal(applyTool(base, "erase", 0, 0), base);
});

test("tools ignore cells outside the board", () => {
  for (const tool of ["light", "press", "hole", "erase"] as const) {
    assert.equal(applyTool(base, tool, 3, 0), base);
    assert.equal(applyTool(base, tool, 0, -1), base);
  }
});

test("a puzzle built only by pressing backwards is always solvable", () => {
  let data: LightsOutData = { rows: ["....#", ".....", "#....", "....."] };
  for (const [x, y] of [[0, 0], [3, 1], [2, 3], [4, 3], [1, 2]] as const) data = applyTool(data, "press", x, y);
  const result = solve(data, { maxNodes: 100_000 });
  assert.equal(result.status, "solved");
  if (result.status === "solved") assert.ok(result.moves.length <= 5);
});

test("resize adds cells with the light off and cuts cells outside", () => {
  assert.deepEqual(resize(base, 4, 4).rows, ["....", ".*..", "..#.", "...."]);
  assert.deepEqual(resize({ rows: ["*..*", "....", "...*", "*..."] }, 3, 3).rows, ["*..", "...", "..."]);
});

test("resize clamps to the limits and is a no-op without change", () => {
  assert.equal(resize(base, 3, 3), base);
  const big = resize(base, 1, 99);
  assert.equal(big.rows.length, 10);
  assert.equal(big.rows[0]!.length, 3);
});
