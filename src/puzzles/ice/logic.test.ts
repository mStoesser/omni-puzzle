import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyMove,
  createDefault,
  dirTowards,
  findProblems,
  initState,
  isSolved,
  parseDraft,
  slide,
  validate,
} from "./logic.ts";
import type { IceCell, IceData } from "./logic.ts";
import { solve } from "./solver.ts";

// One character per cell: "." ice, "#" rock, ":" sand, "G" goal, "S" start.
function board(rows: string[]): IceData {
  const cells: IceCell[] = [];
  const kinds = { "#": "wall", ":": "sand", G: "goal", S: "start" } as const;
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch !== ".") cells.push({ x, y, kind: kinds[ch as keyof typeof kinds] });
    }),
  );
  return { width: rows[0]!.length, height: rows.length, cells };
}

const codes = (data: IceData) => findProblems(data).map((p) => p.code);

test("the default puzzle is valid, solvable and not solved at the start", () => {
  const data = createDefault();
  assert.deepEqual(validate(data), data);
  assert.equal(isSolved(data, initState(data)), false);
  const result = solve(data, { maxNodes: 1000 });
  assert.equal(result.status, "solved");
  if (result.status === "solved") assert.deepEqual(result.moves, ["S", "E"]);
});

test("the figure slides until the edge or a rock stops it", () => {
  const data = board(["S...#.", "......"]);
  assert.deepEqual(slide(data, { x: 0, y: 0 }, "E"), { x: 3, y: 0 }); // rock at x=4
  assert.deepEqual(slide(data, { x: 0, y: 0 }, "S"), { x: 0, y: 1 }); // edge
  assert.deepEqual(slide(data, { x: 0, y: 1 }, "E"), { x: 5, y: 1 });
});

test("sand stops the figure on the sand cell, and it can slide on from there", () => {
  const data = board(["S.:..."]);
  assert.deepEqual(slide(data, { x: 0, y: 0 }, "E"), { x: 2, y: 0 });
  assert.deepEqual(slide(data, { x: 2, y: 0 }, "E"), { x: 5, y: 0 });
});

test("a move into a rock or the edge right in front is invalid", () => {
  const data = board(["S#", ".."]);
  const start = initState(data);
  assert.equal(applyMove(data, start, "E"), null);
  assert.equal(applyMove(data, start, "N"), null);
  assert.equal(applyMove(data, start, "W"), null);
  assert.deepEqual(applyMove(data, start, "S"), { x: 0, y: 1 });
});

test("unknown moves and positions off the board are rejected", () => {
  const data = board(["S..", "..G"]);
  assert.equal(applyMove(data, initState(data), "X" as never), null);
  assert.equal(applyMove(data, { x: -1, y: -1 }, "E"), null);
});

test("moves do not mutate the state", () => {
  const data = board(["S..", "..G"]);
  const state = initState(data);
  const copy = { ...state };
  applyMove(data, state, "E");
  assert.deepEqual(state, copy);
});

test("solved only when the figure rests on a goal, not when it slides over it", () => {
  const over = board(["SG.."]);
  const after = applyMove(over, initState(over), "E")!;
  assert.deepEqual(after, { x: 3, y: 0 });
  assert.equal(isSolved(over, after), false);

  const stop = board(["S.G#"]);
  assert.equal(isSolved(stop, applyMove(stop, initState(stop), "E")!), true);
});

test("a goal on sand-free ice is reached at the edge", () => {
  const data = board(["S..G"]);
  assert.equal(isSolved(data, applyMove(data, initState(data), "E")!), true);
});

test("problems: missing start and goal, several starts, duplicates, out of bounds", () => {
  assert.deepEqual(codes(board(["...", "..."])), ["no-start", "no-goal"]);
  assert.deepEqual(codes(board(["S.S", "..G"])), ["multiple-starts", "multiple-starts"]);
  const duplicate = board(["S.G"]);
  duplicate.cells.push({ x: 1, y: 0, kind: "wall" }, { x: 1, y: 0, kind: "sand" });
  assert.deepEqual(codes(duplicate), ["duplicate-cell"]);
  const outside = board(["S.G"]);
  outside.cells.push({ x: 5, y: 0, kind: "wall" });
  assert.deepEqual(codes(outside), ["out-of-bounds"]);
});

test("validate rejects bad structure and problems, parseDraft accepts drafts with problems", () => {
  assert.throws(() => validate(null));
  assert.throws(() => validate({ width: 2, height: 5, cells: [] }), /width/);
  assert.throws(() => validate({ width: 5, height: 15, cells: [] }), /height/);
  assert.throws(() => validate({ width: 5, height: 5, cells: "x" }), /cells/);
  assert.throws(() => validate({ width: 5, height: 5, cells: [{ x: 0, y: 0, kind: "lava" }] }), /kind/);
  assert.throws(() => validate({ width: 5, height: 5, cells: [{ x: 0.5, y: 0, kind: "wall" }] }), /x/);
  assert.throws(() => validate(board(["S..", "...", "..."])), /no-goal/);
  assert.deepEqual(parseDraft(board(["...", "...", "..."])).cells, []);
});

test("validate returns a clean copy without unknown fields", () => {
  const raw = { width: 3, height: 3, extra: 1, cells: [{ x: 0, y: 0, kind: "start", evil: "<b>" }, { x: 2, y: 0, kind: "goal" }] };
  assert.deepEqual(validate(raw), { width: 3, height: 3, cells: [{ x: 0, y: 0, kind: "start" }, { x: 2, y: 0, kind: "goal" }] });
});

test("a draft without start has the figure off the board", () => {
  assert.deepEqual(initState(board(["..G"])), { x: -1, y: -1 });
});

test("dirTowards: same row or column only", () => {
  const from = { x: 2, y: 2 };
  assert.equal(dirTowards(from, { x: 2, y: 0 }), "N");
  assert.equal(dirTowards(from, { x: 2, y: 5 }), "S");
  assert.equal(dirTowards(from, { x: 0, y: 2 }), "W");
  assert.equal(dirTowards(from, { x: 4, y: 2 }), "E");
  assert.equal(dirTowards(from, { x: 3, y: 3 }), null);
  assert.equal(dirTowards(from, from), null);
});
