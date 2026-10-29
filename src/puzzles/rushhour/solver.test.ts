import { test } from "node:test";
import assert from "node:assert/strict";
import { applyMove, initState, isSolved } from "./logic.ts";
import type { Block, RushHourData, RushHourMove } from "./logic.ts";
import { solve } from "./solver.ts";

const LIMITS = { maxNodes: 100_000 };
const target: Block = { id: "t", x: 0, y: 2, length: 2, axis: "h", target: true };

function puzzle(blocks: Block[], size = 6): RushHourData {
  return { width: size, height: size, blocks, exit: { side: "E", index: size === 3 ? 1 : 2 } };
}

function replay(data: RushHourData, moves: RushHourMove[]) {
  let state = initState(data);
  for (const move of moves) {
    const next = applyMove(data, state, move);
    assert.ok(next, `illegal move ${JSON.stringify(move)}`);
    state = next;
  }
  return state;
}

function minMoves(data: RushHourData): number {
  const result = solve(data, LIMITS);
  assert.equal(result.status, "solved");
  if (result.status !== "solved") return -1;
  assert.equal(isSolved(data, replay(data, result.moves)), true, "solution must solve the puzzle");
  return result.moves.length;
}

test("an already solved puzzle needs 0 moves", () => {
  assert.equal(minMoves(puzzle([{ ...target, x: 4 }])), 0);
});

test("a free path needs exactly 1 move, regardless of distance", () => {
  assert.equal(minMoves(puzzle([target])), 1);
});

test("one blocker that must move out of the way: 2 moves", () => {
  // Vertical blocker in rows 0-2 at x 4 must slide down to rows 3-5.
  assert.equal(minMoves(puzzle([target, { id: "a", x: 4, y: 0, length: 3, axis: "v" }])), 2);
});

test("a blocker that is itself blocked: 3 moves", () => {
  // The vertical blocker can only leave row 2 downwards, but (4,5) is taken by a horizontal block.
  const data = puzzle([
    target,
    { id: "a", x: 4, y: 0, length: 3, axis: "v" },
    { id: "b", x: 4, y: 5, length: 2, axis: "h" },
  ]);
  assert.equal(minMoves(data), 3);
});

test("detects an unsolvable puzzle", () => {
  // On a 3x3 board a vertical block of length 2 in the exit column always covers the middle row.
  const data = puzzle(
    [
      { id: "t", x: 0, y: 1, length: 2, axis: "h", target: true },
      { id: "a", x: 2, y: 0, length: 2, axis: "v" },
    ],
    3,
  );
  assert.deepEqual(solve(data, LIMITS), { status: "unsolvable" });
});

test("detects an immovable blocker as unsolvable", () => {
  assert.deepEqual(solve(puzzle([target, { id: "a", x: 4, y: 0, length: 6, axis: "v" }]), LIMITS), {
    status: "unsolvable",
  });
});

test("aborts when the node limit is reached", () => {
  const data = puzzle([
    target,
    { id: "a", x: 4, y: 0, length: 3, axis: "v" },
    { id: "b", x: 4, y: 5, length: 2, axis: "h" },
  ]);
  assert.deepEqual(solve(data, { maxNodes: 3 }), { status: "aborted" });
});
