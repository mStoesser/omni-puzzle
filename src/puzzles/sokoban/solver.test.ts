import { test } from "node:test";
import assert from "node:assert/strict";
import { breadthFirst } from "../../core/search.ts";
import { DIRS } from "../../core/grid.ts";
import { applyMove, initState, isSolved } from "./logic.ts";
import type { SokobanData, SokobanMove, SokobanState } from "./logic.ts";
import { solve } from "./solver.ts";

const LIMITS = { maxNodes: 200_000 };
const board = (...rows: string[]): SokobanData => ({ rows });

function replay(data: SokobanData, moves: SokobanMove[]) {
  let state = initState(data);
  for (const move of moves) {
    const next = applyMove(data, state, move);
    assert.ok(next, `illegal move ${move}`);
    state = next;
  }
  return state;
}

/** Plain breadth-first search without any pruning, as a reference. */
function referenceMinimum(data: SokobanData): number | null {
  const result = breadthFirst<SokobanState, SokobanMove>(
    {
      start: initState(data),
      key: (s) => `${s.player}|${[...s.boxes].sort((a, b) => a - b).join(",")}`,
      *next(s) {
        for (const dir of DIRS) {
          const child = applyMove(data, s, dir);
          if (child) yield [dir, child] as const;
        }
      },
      isGoal: (s) => isSolved(data, s),
    },
    LIMITS,
  );
  return result.status === "solved" ? result.moves.length : null;
}

function minMoves(data: SokobanData): number {
  const result = solve(data, LIMITS);
  assert.equal(result.status, "solved");
  if (result.status !== "solved") return -1;
  assert.equal(isSolved(data, replay(data, result.moves)), true, "solution must solve the puzzle");
  return result.moves.length;
}

test("one push onto the goal", () => {
  assert.equal(minMoves(board("#####", "#@$.#", "#####")), 1);
});

test("walks around to push from the other side", () => {
  const data = board(
    "#######", //
    "#     #",
    "# @$. #",
    "#     #",
    "#######",
  );
  assert.equal(minMoves(data), 1);
  const other = board(
    "#######", //
    "#     #",
    "# .$@ #",
    "#     #",
    "#######",
  );
  assert.equal(minMoves(other), 1);
  const behind = board(
    "#######", //
    "#     #",
    "# .$  #",
    "#  @  #",
    "#######",
  );
  // Right, up, then push left: 3 steps.
  assert.equal(minMoves(behind), 3);
});

test("pruning dead squares never changes the minimum", () => {
  const puzzles = [
    board("########", "#      #", "# $$ . #", "#  @ . #", "#      #", "########"),
    board("#######", "#.  ###", "# $   #", "#  #$ #", "# @ . #", "#######"),
    board("######", "#  . #", "# #$ #", "# $ .#", "#@   #", "######"),
  ];
  for (const data of puzzles) assert.equal(minMoves(data), referenceMinimum(data), data.rows.join("\n"));
});

test("a box in a corner without a goal is unsolvable at once", () => {
  const data = board("#####", "#$  #", "#  .#", "# @ #", "#####");
  assert.equal(solve(data, { maxNodes: 1 }).status, "unsolvable");
});

test("a box that can never reach its goal is unsolvable", () => {
  // The box is stuck against the top wall; the goal is not on that wall.
  const data = board("######", "# $  #", "#    #", "#  .@#", "######");
  assert.equal(solve(data, LIMITS).status, "unsolvable");
});

test("drafts without figure or boxes are unsolvable", () => {
  assert.equal(solve(board("#####", "# $.#", "#####"), LIMITS).status, "unsolvable");
  assert.equal(solve(board("#####", "#@ .#", "#####"), LIMITS).status, "unsolvable");
});

test("aborts when the node limit is reached", () => {
  const data = board("########", "#      #", "# $$ . #", "#  @ . #", "#      #", "########");
  assert.equal(solve(data, { maxNodes: 10 }).status, "aborted");
});
