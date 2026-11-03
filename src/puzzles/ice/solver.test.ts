import { test } from "node:test";
import assert from "node:assert/strict";
import { applyMove, initState, isSolved } from "./logic.ts";
import type { IceCell, IceData, IceMove } from "./logic.ts";
import { solve } from "./solver.ts";

const LIMITS = { maxNodes: 100_000 };

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

function replay(data: IceData, moves: IceMove[]) {
  let state = initState(data);
  for (const move of moves) {
    const next = applyMove(data, state, move);
    assert.ok(next, `illegal move ${move}`);
    state = next;
  }
  return state;
}

function minMoves(data: IceData): number {
  const result = solve(data, LIMITS);
  assert.equal(result.status, "solved");
  if (result.status !== "solved") return -1;
  assert.equal(isSolved(data, replay(data, result.moves)), true, "solution must solve the puzzle");
  return result.moves.length;
}

test("one slide to the goal at the edge", () => {
  assert.equal(minMoves(board(["S...G"])), 1);
});

test("finds the shortest path around rocks", () => {
  const data = board([
    "S..#", //
    "....",
    "#..G",
  ]);
  // After one slide the figure is at (2,0) or (0,1); neither reaches the goal in one more slide.
  // E → (2,0), S → (2,2), E → goal: 3 slides.
  assert.equal(minMoves(data), 3);
});

test("sand makes a goal in the middle reachable", () => {
  // Without a stopper behind the goal the figure stops on the sand and then slides over the goal.
  assert.equal(solve(board(["S.:G."]), LIMITS).status, "unsolvable");
  assert.equal(minMoves(board(["S.:G#"])), 2);
});

test("a goal the figure can never stop on is unsolvable", () => {
  assert.equal(solve(board(["S.G.."]), LIMITS).status, "unsolvable");
});

test("a draft without a start is unsolvable", () => {
  assert.equal(solve(board(["..G"]), LIMITS).status, "unsolvable");
});

test("aborts when the node limit is reached", () => {
  const data = board([
    "S.........", //
    "..........",
    "..........",
    "..........",
    ".........G",
  ]);
  data.cells.pop(); // no goal: explores everything
  assert.equal(solve(data, { maxNodes: 2 }).status, "aborted");
});
