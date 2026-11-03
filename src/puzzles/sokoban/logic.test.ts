import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyMove,
  createDefault,
  findProblems,
  initState,
  insideCells,
  isSolved,
  liveCells,
  parseDraft,
  prepare,
  validate,
  walkPath,
} from "./logic.ts";
import type { SokobanData } from "./logic.ts";
import { solve } from "./solver.ts";

const board = (...rows: string[]): SokobanData => ({ rows });
const codes = (data: SokobanData) => findProblems(data).map((p) => p.code);

test("the default puzzle is valid, unsolved and needs 2 steps", () => {
  const data = createDefault();
  assert.deepEqual(validate(data), data);
  assert.equal(isSolved(data, initState(data)), false);
  const result = solve(data, { maxNodes: 1000 });
  assert.equal(result.status, "solved");
  if (result.status === "solved") assert.deepEqual(result.moves, ["N", "W"]);
});

test("initState reads figure and boxes as cell indexes", () => {
  const data = board("#####", "#@$*#", "#####");
  assert.deepEqual(initState(data), { player: 6, boxes: [7, 8] });
  assert.deepEqual(initState(board("#####", "# + #", "#####")), { player: 7, boxes: [] });
});

test("walking: floor is fine, walls and the edge are not", () => {
  const data = board("#####", "#@  #", "#####");
  const s = initState(data);
  assert.deepEqual(applyMove(data, s, "E"), { player: 7, boxes: [] });
  assert.equal(applyMove(data, s, "W"), null);
  assert.equal(applyMove(data, s, "N"), null);
  const open = board("@  ", "   ", "   ");
  assert.equal(applyMove(open, initState(open), "N"), null); // board edge
});

test("pushing moves one box; a box behind a box or a wall blocks", () => {
  const data = board("######", "#@$  #", "#  $$#", "######");
  const s = initState(data);
  assert.deepEqual(applyMove(data, s, "E"), { player: 8, boxes: [9, 15, 16] });
  const atWall = board("#####", "#@$##", "#####");
  assert.equal(applyMove(atWall, initState(atWall), "E"), null);
  const twoBoxes = board("######", "#@$$ #", "######");
  assert.equal(applyMove(twoBoxes, initState(twoBoxes), "E"), null);
});

test("boxes keep their order through pushes (each box stays the same element)", () => {
  const data = board("#######", "#@$  $#", "#######");
  let s = initState(data);
  assert.deepEqual(s.boxes, [9, 12]);
  for (const dir of ["E", "E"] as const) s = applyMove(data, s, dir)!;
  assert.deepEqual(s.boxes, [11, 12]); // the first box, pushed twice, is still the first
});

test("moves do not mutate the state", () => {
  const data = board("#####", "#@$ #", "#####");
  const s = initState(data);
  const copy = structuredClone(s);
  applyMove(data, s, "E");
  assert.deepEqual(s, copy);
});

test("invalid moves and a missing figure are rejected", () => {
  const data = board("#####", "#@$.#", "#####");
  assert.equal(applyMove(data, initState(data), "X" as never), null);
  assert.equal(applyMove(data, { player: -1, boxes: [7] }, "E"), null);
});

test("solved when every box stands on a goal", () => {
  const data = board("#####", "#@$.#", "#####");
  const s = initState(data);
  assert.equal(isSolved(data, s), false);
  assert.equal(isSolved(data, applyMove(data, s, "E")!), true);
  assert.equal(isSolved(board("#####", "#@ *#", "#####"), initState(board("#####", "#@ *#", "#####"))), true);
});

test("problems: figure, boxes and goals", () => {
  assert.deepEqual(codes(board("#####", "# $.#", "#####")), ["no-player"]);
  assert.deepEqual(codes(board("#####", "#@$@#", "#.  #", "#####")), ["multiple-players", "multiple-players"]);
  assert.deepEqual(codes(board("#####", "#@ .#", "#####")), ["no-boxes"]);
  assert.deepEqual(codes(board("#####", "#@$$#", "#.  #", "#####")), ["box-goal-count"]);
  assert.deepEqual(codes(board("#####", "#+$ #", "#####")), []); // the figure may stand on the goal
});

test("validate and parseDraft check the structure", () => {
  assert.throws(() => validate(null));
  assert.throws(() => validate({ rows: ["###", "#@#"] }), /height/);
  assert.throws(() => validate({ rows: ["##", "##", "##"] }), /width/);
  assert.throws(() => validate({ rows: ["####", "###", "###"] }), /equal/);
  assert.throws(() => validate({ rows: ["###", "#x#", "###"] }), /unknown/);
  assert.throws(() => validate({ rows: ["###", "#@#", 5] }), /equal/);
  assert.throws(() => validate({ rows: Array(21).fill("###") }), /height/);
  assert.throws(() => validate(board("#####", "#@ .#", "#####")), /no-boxes/);
  assert.deepEqual(parseDraft(board("###", "# #", "###")), board("###", "# #", "###"));
});

test("validate returns a clean copy without unknown fields", () => {
  const raw = { rows: ["#####", "#@$.#", "#####"], evil: "<b>" };
  const clean = validate(raw);
  assert.deepEqual(clean, { rows: raw.rows });
  assert.notEqual(clean.rows, raw.rows);
});

test("walkPath finds the shortest way around boxes and walls, or null", () => {
  const data = board("######", "#@ $ #", "#    #", "######");
  const s = initState(data);
  // Around the box: 5 steps, without pushing it.
  const path = walkPath(data, s, { x: 4, y: 1 })!;
  assert.equal(path.length, 5);
  const end = path.reduce((state, dir) => applyMove(data, state, dir)!, s);
  assert.deepEqual(end, { player: 10, boxes: s.boxes });
  assert.deepEqual(walkPath(data, s, { x: 1, y: 1 }), []);
  assert.equal(walkPath(data, s, { x: 3, y: 1 }), null); // a box
  assert.equal(walkPath(data, s, { x: 0, y: 0 }), null); // a wall
  assert.equal(walkPath(data, s, { x: 9, y: 9 }), null); // outside
  const shut = board("#####", "#@$ #", "#####");
  assert.equal(walkPath(shut, initState(shut), { x: 3, y: 1 }), null); // only reachable by pushing
});

test("insideCells is what the figure can reach, ignoring boxes", () => {
  const data = board("  #####", "  #@$.#", "  #####");
  assert.deepEqual([...insideCells(data)].sort((a, b) => a - b), [10, 11, 12]);
});

test("liveCells marks corners without goals as dead", () => {
  const live = liveCells(prepare(board("#####", "#   #", "#  .#", "#   #", "#####")));
  const at = (x: number, y: number) => live[y * 5 + x];
  assert.equal(at(3, 2), 1); // the goal
  assert.equal(at(2, 2), 1); // can be pushed right onto it
  assert.equal(at(1, 1), 0); // corner
  assert.equal(at(1, 3), 0); // corner
  assert.equal(at(1, 2), 0); // against the left wall: can only move up and down there, never to the goal
});
