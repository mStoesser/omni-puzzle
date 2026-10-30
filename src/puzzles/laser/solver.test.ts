import { test } from "node:test";
import assert from "node:assert/strict";
import { applyMove, createDefault, initState, isSolved } from "./logic.ts";
import type { LaserData, LaserMove, LaserState, Orientation } from "./logic.ts";
import { solve } from "./solver.ts";

const LIMITS = { maxNodes: 100_000 };

function replay(data: LaserData, moves: LaserMove[]): LaserState {
  return moves.reduce((state, move) => applyMove(data, state, move)!, initState(data));
}

test("an already solved puzzle needs no moves", () => {
  const data: LaserData = {
    width: 4,
    height: 4,
    cells: [
      { x: 0, y: 0, cell: { kind: "emitter", dir: "E" } },
      { x: 3, y: 0, cell: { kind: "target" } },
    ],
  };
  assert.deepEqual(solve(data, LIMITS), { status: "solved", moves: [] });
});

test("solves the default puzzle with one flip", () => {
  const data = createDefault();
  const result = solve(data, LIMITS);
  assert.deepEqual(result, { status: "solved", moves: [{ x: 4, y: 1 }] });
});

// Row 0: emitter, rotatable mirrors at x=2 and x=4. Row 2: mirror at (2,2), rotatable mirror at (4,2).
function layout(fixed: Orientation, targetAt: { x: number; y: number }, start: [Orientation, Orientation]): LaserData {
  return {
    width: 6,
    height: 3,
    cells: [
      { x: 0, y: 0, cell: { kind: "emitter", dir: "E" } },
      { x: 2, y: 0, cell: { kind: "mirror", orientation: start[0], rotatable: true } },
      { x: 4, y: 0, cell: { kind: "mirror", orientation: start[1], rotatable: true } },
      { x: 2, y: 2, cell: { kind: "mirror", orientation: fixed, rotatable: false } },
      { x: 4, y: 2, cell: { kind: "mirror", orientation: "/", rotatable: true } },
      { ...targetAt, cell: { kind: "target" } },
    ],
  };
}

test("finds the minimal number of flips, and the moves really solve it", () => {
  // Path: (2,0) "\\" down → (2,2) "\\" right → (4,2) "/" up → (4,0) "/" right → target (5,0).
  const data = layout("\\", { x: 5, y: 0 }, ["/", "\\"]);
  const result = solve(data, LIMITS);
  assert.equal(result.status, "solved");
  if (result.status !== "solved") return;
  assert.deepEqual(result.moves, [{ x: 2, y: 0 }, { x: 4, y: 0 }]);
  assert.ok(isSolved(data, replay(data, result.moves)));
});

test("detects unsolvable puzzles", () => {
  // The beam always hits (2,0): "/" sends it off the top, "\\" down to the fixed "/" at (2,2), which sends it off the left.
  assert.deepEqual(solve(layout("/", { x: 5, y: 2 }, ["/", "/"]), LIMITS), { status: "unsolvable" });
});

test("aborts when the search limit is reached", () => {
  // 16 rotatable mirrors the beam never reaches: all 2^16 sets would have to be tried.
  const cells: LaserData["cells"] = [{ x: 0, y: 0, cell: { kind: "emitter", dir: "S" } }];
  for (let i = 0; i < 16; i++) {
    cells.push({ x: 2 + (i % 8), y: 2 + Math.floor(i / 8), cell: { kind: "mirror", orientation: "/", rotatable: true } });
  }
  cells.push({ x: 11, y: 11, cell: { kind: "target" } });
  const data: LaserData = { width: 12, height: 12, cells };
  assert.deepEqual(solve(data, { maxNodes: 1000 }), { status: "aborted" });
});
