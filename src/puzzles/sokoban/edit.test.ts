import { test } from "node:test";
import assert from "node:assert/strict";
import { applyTool, isTool, resize } from "./edit.ts";
import type { SokobanData } from "./logic.ts";

const board = (...rows: string[]): SokobanData => ({ rows });

test("walls and the eraser replace whatever is on the cell", () => {
  const data = board("#####", "#@$.#", "#####");
  assert.deepEqual(applyTool(data, "wall", 2, 1).rows, ["#####", "#@#.#", "#####"]);
  assert.deepEqual(applyTool(data, "erase", 3, 1).rows, ["#####", "#@$ #", "#####"]);
  assert.deepEqual(applyTool(data, "erase", 0, 0).rows, [" ####", "#@$.#", "#####"]);
});

test("boxes and goals combine to a box on a goal", () => {
  const data = board("#####", "#@$.#", "#####");
  assert.deepEqual(applyTool(data, "box", 3, 1).rows[1], "#@$*#");
  assert.deepEqual(applyTool(data, "goal", 2, 1).rows[1], "#@*.#");
});

test("a goal under the figure stays a goal", () => {
  const data = board("#####", "#@$.#", "#####");
  assert.deepEqual(applyTool(data, "goal", 1, 1).rows[1], "#+$.#");
});

test("there is only one figure: placing it moves it and keeps goals", () => {
  const data = board("#####", "#+$ #", "#####");
  assert.deepEqual(applyTool(data, "player", 3, 1).rows[1], "#.$@#");
  assert.deepEqual(applyTool(board("#####", "#@$.#", "#####"), "player", 3, 1).rows[1], "# $+#");
});

test("placing the same thing again or outside changes nothing (same object)", () => {
  const data = board("#####", "#@$.#", "#####");
  assert.equal(applyTool(data, "wall", 0, 0), data);
  assert.equal(applyTool(data, "box", 2, 1), data);
  assert.equal(applyTool(data, "player", 1, 1), data);
  assert.equal(applyTool(data, "wall", 5, 1), data);
  assert.equal(applyTool(data, "wall", -1, 1), data);
});

test("tools do not mutate the data", () => {
  const data = board("#####", "#@$.#", "#####");
  const copy = structuredClone(data);
  for (const tool of ["wall", "box", "goal", "player", "erase"] as const) applyTool(data, tool, 3, 1);
  assert.deepEqual(data, copy);
});

test("resize pads with floor, cuts and clamps", () => {
  const data = board("###", "#@#", "###");
  assert.deepEqual(resize(data, 4, 4).rows, ["### ", "#@# ", "### ", "    "]);
  assert.deepEqual(resize(resize(data, 4, 4), 3, 3).rows, data.rows);
  assert.equal(resize(data, 1, 99).rows.length, 20);
  assert.equal(resize(data, 3, 3), data);
});

test("isTool", () => {
  assert.equal(isTool("box"), true);
  assert.equal(isTool("lava"), false);
});
