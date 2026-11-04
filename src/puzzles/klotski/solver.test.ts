import { test } from "node:test";
import assert from "node:assert/strict";
import { applyMove, initState, isSolved } from "./logic.ts";
import type { Block, KlotskiData, KlotskiMove } from "./logic.ts";
import { sizeGroups, solve, stateKey } from "./solver.ts";

const LIMITS = { maxNodes: 100_000 };

const block = (id: string, x: number, y: number, w: number, h: number, target?: true): Block =>
  target ? { id, x, y, w, h, target } : { id, x, y, w, h };

/** The classic Huarong Dao start ("Heng Dao Li Ma"); its shortest solution has 81 moves. */
export const huarongDao: KlotskiData = {
  width: 4,
  height: 5,
  exit: { side: "S", index: 1 },
  blocks: [
    block("t", 1, 0, 2, 2, true),
    block("a", 0, 0, 1, 2),
    block("b", 3, 0, 1, 2),
    block("c", 0, 2, 1, 2),
    block("d", 3, 2, 1, 2),
    block("e", 1, 2, 2, 1),
    block("f", 1, 3, 1, 1),
    block("g", 2, 3, 1, 1),
    block("h", 0, 4, 1, 1),
    block("i", 3, 4, 1, 1),
  ],
};

function replay(data: KlotskiData, moves: KlotskiMove[]) {
  let state = initState(data);
  for (const move of moves) {
    const next = applyMove(data, state, move);
    assert.ok(next, `illegal move ${JSON.stringify(move)}`);
    state = next;
  }
  return state;
}

function minMoves(data: KlotskiData, limits = LIMITS): number {
  const result = solve(data, limits);
  assert.equal(result.status, "solved");
  if (result.status !== "solved") return -1;
  assert.equal(isSolved(data, replay(data, result.moves)), true, "solution must solve the puzzle");
  return result.moves.length;
}

test("an already solved puzzle needs 0 moves", () => {
  assert.equal(minMoves({ ...huarongDao, blocks: [block("t", 1, 3, 2, 2, true)] }), 0);
});

test("a slide around a corner is a single move", () => {
  // 3×3: the target goes down column 0 and then right along row 2 to the exit on the east side.
  const data: KlotskiData = {
    width: 3,
    height: 3,
    exit: { side: "E", index: 2 },
    blocks: [block("t", 0, 0, 1, 1, true), block("a", 1, 0, 2, 2)],
  };
  assert.equal(minMoves(data), 1);
});

test("one blocker that must move out of the way: 2 moves", () => {
  const data: KlotskiData = { ...huarongDao, blocks: [block("t", 1, 0, 2, 2, true), block("a", 1, 2, 2, 1)] };
  assert.equal(minMoves(data), 2);
});

test("the classic Huarong Dao takes 81 moves and stays within the server limit", () => {
  assert.equal(minMoves(huarongDao, { maxNodes: 40_000 }), 81);
});

test("blocks of the same size are interchangeable in the state key", () => {
  const groups = sizeGroups(huarongDao);
  assert.deepEqual(groups, [[0], [1, 2, 3, 4], [5], [6, 7, 8, 9]]);
  const state = initState(huarongDao);
  const swapped = { pos: state.pos.map((p, i) => (i === 6 ? state.pos[9]! : i === 9 ? state.pos[6]! : p)) };
  assert.equal(stateKey(groups, swapped), stateKey(groups, state));
  const moved = { pos: state.pos.map((p, i) => (i === 8 ? p + 1 : p)) };
  assert.notEqual(stateKey(groups, moved), stateKey(groups, state));
});

test("detects an unsolvable puzzle", () => {
  // A full board: nothing can move.
  const blocks = [block("t", 0, 0, 1, 1, true)];
  for (let i = 1; i < 9; i++) blocks.push(block(`b${i}`, i % 3, Math.floor(i / 3), 1, 1));
  const data: KlotskiData = { width: 3, height: 3, exit: { side: "E", index: 2 }, blocks };
  assert.deepEqual(solve(data, LIMITS), { status: "unsolvable" });
});

test("detects a target that can never fit through the exit area", () => {
  // 3 wide: the 2×1 bar never fits beside the target, so it stays in rows 2-3 and always covers column 1.
  const data: KlotskiData = {
    width: 3,
    height: 4,
    exit: { side: "S", index: 0 },
    blocks: [block("t", 0, 0, 2, 2, true), block("a", 0, 2, 2, 1)],
  };
  assert.deepEqual(solve(data, LIMITS), { status: "unsolvable" });
});

test("aborts when the node limit is reached", () => {
  assert.deepEqual(solve(huarongDao, { maxNodes: 50 }), { status: "aborted" });
});
