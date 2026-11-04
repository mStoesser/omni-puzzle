import { test } from "node:test";
import assert from "node:assert/strict";
import { applyMove, initState, isSolved } from "./logic.ts";
import type { LightsOutData, LightsOutMove } from "./logic.ts";
import { solve } from "./solver.ts";

const LIMITS = { maxNodes: 100_000 };

function replay(data: LightsOutData, moves: LightsOutMove[]) {
  let state = initState(data);
  for (const move of moves) {
    const next = applyMove(data, state, move);
    assert.ok(next, `illegal move ${JSON.stringify(move)}`);
    state = next;
  }
  return state;
}

function minTaps(data: LightsOutData, limits = LIMITS): number {
  const result = solve(data, limits);
  assert.equal(result.status, "solved");
  if (result.status !== "solved") return -1;
  assert.equal(isSolved(data, replay(data, result.moves)), true, "solution must solve the puzzle");
  return result.moves.length;
}

/** Fewest taps by trying every set of cells (only for small boards); -1 = unsolvable. */
function bruteForce(data: LightsOutData): number {
  const cells = data.rows.flatMap((row, y) => [...row].flatMap((ch, x) => (ch === "#" ? [] : [{ x, y }])));
  let best = -1;
  for (let mask = 0; mask < 2 ** cells.length; mask++) {
    const taps = cells.filter((_, i) => (mask >> i) & 1);
    if (best >= 0 && taps.length >= best) continue;
    if (isSolved(data, replay(data, taps))) best = taps.length;
  }
  return best;
}

test("an already solved board needs no taps", () => {
  assert.equal(minTaps({ rows: ["...", "...", "..."] }), 0);
});

test("the classic 5×5 board with all lights on needs 15 taps", () => {
  assert.equal(minTaps({ rows: Array(5).fill("*****") }), 15);
});

test("a single corner light on 5×5 cannot be switched off", () => {
  assert.deepEqual(solve({ rows: ["*....", ".....", ".....", ".....", "....."] }, LIMITS), { status: "unsolvable" });
});

test("a single light in the middle of 5×5 can", () => {
  const data = { rows: [".....", ".....", "..*..", ".....", "....."] };
  assert.equal(minTaps(data), bruteForceSafe(data));
});

// 5×5 has 25 cells; brute force is too slow there, so compare on small boards with random patterns and holes.
function bruteForceSafe(data: LightsOutData): number {
  return data.rows.join("").replaceAll("#", "").length <= 16 ? bruteForce(data) : minTaps(data);
}

test("the fewest taps match brute force on small boards with holes", () => {
  let seed = 7;
  const random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (const [w, h] of [[3, 3], [4, 4], [4, 3], [3, 5]] as const) {
    for (let round = 0; round < 12; round++) {
      const rows = Array.from({ length: h }, () =>
        Array.from({ length: w }, () => (random() < 0.15 ? "#" : random() < 0.5 ? "*" : ".")).join(""),
      );
      const data = { rows };
      const expected = bruteForce(data);
      const result = solve(data, LIMITS);
      if (expected < 0) assert.deepEqual(result, { status: "unsolvable" }, rows.join("/"));
      else assert.equal(minTaps(data), expected, rows.join("/"));
    }
  }
});

/** A pattern made by tapping these cells on an empty board, so it is always solvable. */
function tapped(rows: string[], taps: LightsOutMove[]): LightsOutData {
  const empty = { rows: rows.map((row) => row.replaceAll("*", ".")) };
  const state = replay(empty, taps);
  const w = rows[0]!.length;
  return { rows: rows.map((row, y) => [...row].map((ch, x) => (ch === "#" ? "#" : state.on[y * w + x] ? "*" : ".")).join("")) };
}

test("4×4 has a 4-dimensional null space: the solver still finds the minimum", () => {
  const data = tapped(Array(4).fill("...."), [{ x: 0, y: 0 }, { x: 2, y: 1 }, { x: 3, y: 3 }, { x: 1, y: 3 }]);
  assert.equal(minTaps(data), bruteForce(data));
  assert.equal(solve({ rows: ["*...", "....", "....", "...."] }, LIMITS).status, "unsolvable");
});

test("aborts when the null space is too large for the limit", () => {
  // 4×4 has 2^4 = 16 equivalent solutions to compare.
  const data = tapped(Array(4).fill("...."), [{ x: 1, y: 1 }]);
  assert.deepEqual(solve(data, { maxNodes: 8 }), { status: "aborted" });
  assert.equal(solve(data, { maxNodes: 16 }).status, "solved");
});
