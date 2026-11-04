import { test } from "node:test";
import assert from "node:assert/strict";
import { applyTool, editorImage, resize } from "./edit.ts";
import { createDefault, fromImage, validate } from "./logic.ts";

const base = fromImage(["...", ".#.", "..."]);

test("fill and erase change the picture and the clues follow", () => {
  const next = applyTool(base, "fill", 0, 0);
  assert.deepEqual(next.image, ["#..", ".#.", "..."]);
  assert.deepEqual(next.rows, [[1], [1], []]);
  assert.deepEqual(next.cols, [[1], [1], []]);
  assert.deepEqual(applyTool(next, "erase", 1, 1).image, ["#..", "...", "..."]);
});

test("tools are no-ops on unchanged cells and outside the board", () => {
  assert.equal(applyTool(base, "fill", 1, 1), base);
  assert.equal(applyTool(base, "erase", 0, 0), base);
  assert.equal(applyTool(base, "fill", 3, 0), base);
});

test("toggle (keyboard) clears a filled cell with the fill tool", () => {
  assert.deepEqual(applyTool(base, "fill", 1, 1, true).image, ["...", "...", "..."]);
  assert.deepEqual(applyTool(base, "fill", 0, 1, true).image, ["...", "##.", "..."]);
});

test("a puzzle without picture (copied from a link) shows its unique solution", () => {
  const clues = validate(createDefault());
  assert.equal(clues.image, undefined);
  assert.deepEqual(editorImage(clues), createDefault().image);
  // The first change brings the picture back into the data.
  assert.deepEqual(applyTool(clues, "fill", 0, 0).image, ["#....", "..#..", ".###.", "..#..", "....."]);
  // Nothing to change: still worth keeping the picture from now on.
  assert.deepEqual(applyTool(clues, "fill", 2, 2).image, createDefault().image);
});

test("resize pads with empty cells and cuts", () => {
  assert.deepEqual(resize(base, 4, 3).image, ["....", ".#..", "...."]);
  const big = resize(createDefault(), 3, 3);
  assert.deepEqual(big.image, ["...", "..#", ".##"]);
  assert.deepEqual(big.rows, [[], [1], [2]]);
  assert.equal(resize(base, 3, 3), base);
  assert.equal(resize(base, 1, 99).height, 15);
});
