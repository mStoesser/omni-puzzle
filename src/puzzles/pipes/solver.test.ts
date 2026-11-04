import { test } from "node:test";
import assert from "node:assert/strict";
import { applyMove, canTurn, initState, isFixed, isSolved, maskAt } from "./logic.ts";
import type { PipesData, PipesMove } from "./logic.ts";
import { solve } from "./solver.ts";

const LIMITS = { maxNodes: 100_000 };

function replay(data: PipesData, moves: PipesMove[]) {
  let state = initState(data);
  for (const move of moves) {
    const next = applyMove(data, state, move);
    assert.ok(next, `illegal move ${JSON.stringify(move)}`);
    state = next;
  }
  return state;
}

function minTurns(data: PipesData, limits = LIMITS): number {
  const result = solve(data, limits);
  assert.equal(result.status, "solved");
  if (result.status !== "solved") return -1;
  assert.equal(isSolved(data, replay(data, result.moves)), true, "solution must solve the puzzle");
  return result.moves.length;
}

/** Fewest turns by trying all 4^k orientations of the k turnable tiles; -1 = unsolvable. */
function bruteForce(data: PipesData): number {
  const w = data.rows[0]!.length;
  const cells: number[] = [];
  for (let i = 0; i < w * data.rows.length; i++) {
    const x = i % w;
    const y = Math.floor(i / w);
    if (canTurn(maskAt(data, x, y)) && !isFixed(data, x, y)) cells.push(i);
  }
  let best = -1;
  for (let combo = 0; combo < 4 ** cells.length; combo++) {
    const turns = new Array<number>(w * data.rows.length).fill(0);
    let total = 0;
    cells.forEach((cell, k) => {
      turns[cell] = Math.floor(combo / 4 ** k) % 4;
      total += turns[cell]!;
    });
    if ((best < 0 || total < best) && isSolved(data, { turns })) best = total;
  }
  return best;
}

test("an already solved network needs no turns", () => {
  assert.equal(minTurns({ rows: ["6c0", "390", "000"], source: { x: 0, y: 0 }, fixed: [] }), 0);
});

test("a curve beside an end can never close", () => {
  assert.deepEqual(solve({ rows: ["000", "260", "000"], source: { x: 0, y: 1 }, fixed: [] }, LIMITS), { status: "unsolvable" });
});

test("counts the cheapest clockwise turns per tile", () => {
  // Source end pointing N at (0,0)? Off the board: it must turn. Line source → straight → end.
  const data: PipesData = { rows: ["152", "000", "000"], source: { x: 0, y: 0 }, fixed: [] };
  // (0,0) N→E: 1 turn; (1,0) N–S → E–W: 1 turn; (2,0) E → W: 2 turns.
  assert.equal(minTurns(data), 4);
});

test("fixed tiles are not turned", () => {
  const data: PipesData = { rows: ["152", "000", "000"], source: { x: 0, y: 0 }, fixed: [1] };
  assert.deepEqual(solve(data, LIMITS), { status: "unsolvable" });
});

test("detects unsolvable networks", () => {
  // Three pipe ends can never pair up.
  assert.deepEqual(solve({ rows: ["100", "000", "001"], source: { x: 0, y: 0 }, fixed: [] }, LIMITS), { status: "unsolvable" });
  // A cross in a corner always points off the board.
  assert.deepEqual(solve({ rows: ["f00", "000", "000"], source: { x: 0, y: 0 }, fixed: [] }, LIMITS), { status: "unsolvable" });
  // Two closed pairs that can only connect among themselves.
  assert.deepEqual(solve({ rows: ["280", "000", "280"], source: { x: 0, y: 0 }, fixed: [] }, LIMITS), { status: "unsolvable" });
});

test("the fewest turns match brute force on small random networks", () => {
  let seed = 5;
  const random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  let checked = 0;
  for (let round = 0; checked < 40 && round < 2000; round++) {
    // Random masks on 3×3 with at most 6 turnable tiles, so brute force stays small.
    const rows = Array.from({ length: 3 }, () =>
      Array.from({ length: 3 }, () => (random() < 0.3 ? "0" : Math.floor(1 + random() * 14).toString(16))).join(""),
    );
    const data: PipesData = { rows, source: { x: 1, y: 1 }, fixed: random() < 0.3 ? [4] : [] };
    if (data.rows[1]![1] === "0") continue;
    const turnable = rows.join("").split("").filter((ch) => ch !== "0" && ch !== "f").length;
    if (turnable > 6) continue;
    checked++;
    const expected = bruteForce(data);
    if (expected < 0) assert.deepEqual(solve(data, LIMITS), { status: "unsolvable" }, rows.join("/"));
    else assert.equal(minTurns(data), expected, rows.join("/"));
  }
  assert.equal(checked, 40);
});

test("a full 4×4 board of curves is unsolvable: they only form separate rings", () => {
  const data: PipesData = { rows: ["3333", "3333", "3333", "3333"], source: { x: 0, y: 0 }, fixed: [] };
  assert.deepEqual(solve(data, LIMITS), { status: "unsolvable" });
});

test("aborts when the node limit is reached", () => {
  // A generated network that propagation alone cannot decide: the search needs 3 nodes.
  const data: PipesData = { rows: ["4800", "6ed2", "9ef3", "2142"], source: { x: 2, y: 2 }, fixed: [] };
  assert.deepEqual(solve(data, { maxNodes: 2 }), { status: "aborted" });
  assert.equal(minTurns(data, { maxNodes: 3 }), minTurns(data));
});
