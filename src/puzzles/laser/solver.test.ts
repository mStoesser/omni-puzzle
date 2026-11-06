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
  // A diagonal of rotatable mirrors in the beam's way and a target it can never reach: every set has to be tried.
  const cells: LaserData["cells"] = [{ x: 0, y: 0, cell: { kind: "emitter", dir: "E" } }];
  for (let i = 1; i < 12; i++) {
    for (let j = 1; j < 12; j += 2) cells.push({ x: i, y: j - 1, cell: { kind: "mirror", orientation: "/", rotatable: true } });
  }
  cells.push({ x: 11, y: 11, cell: { kind: "wall" } }, { x: 10, y: 11, cell: { kind: "target", color: "green" } });
  const data: LaserData = { width: 12, height: 12, cells };
  assert.deepEqual(solve(data, { maxNodes: 1000 }), { status: "aborted" });
});

test("mirrors the beam never reaches are not tried", () => {
  // 16 rotatable mirrors off the beam's path: the search proves at once that nothing helps.
  const cells: LaserData["cells"] = [{ x: 0, y: 0, cell: { kind: "emitter", dir: "S" } }];
  for (let i = 0; i < 16; i++) {
    cells.push({ x: 2 + (i % 8), y: 2 + Math.floor(i / 8), cell: { kind: "mirror", orientation: "/", rotatable: true } });
  }
  cells.push({ x: 11, y: 11, cell: { kind: "target" } });
  assert.deepEqual(solve({ width: 12, height: 12, cells }, { maxNodes: 100 }), { status: "unsolvable" });
});

test("places inventory mirrors: \"/\" costs one tap, \"\\\" two", () => {
  const down: LaserData = {
    width: 5,
    height: 5,
    cells: [
      { x: 0, y: 0, cell: { kind: "emitter", dir: "E" } },
      { x: 3, y: 4, cell: { kind: "target" } },
    ],
    inventory: 1,
  };
  const result = solve(down, LIMITS);
  assert.deepEqual(result, { status: "solved", moves: [{ x: 3, y: 0 }, { x: 3, y: 0 }] });
  assert.ok(isSolved(down, replay(down, result.status === "solved" ? result.moves : [])));

  const up: LaserData = { ...down, cells: [{ x: 0, y: 4, cell: { kind: "emitter", dir: "E" } }, { x: 2, y: 0, cell: { kind: "target" } }] };
  assert.deepEqual(solve(up, LIMITS), { status: "solved", moves: [{ x: 2, y: 4 }] });
  assert.deepEqual(solve({ ...up, inventory: undefined } as LaserData, LIMITS), { status: "unsolvable" });
});

test("uses splitters and colors", () => {
  // A green laser has to reach a green target behind a red filter's row; the splitter must be flipped.
  const data: LaserData = {
    width: 6,
    height: 5,
    cells: [
      { x: 0, y: 2, cell: { kind: "emitter", dir: "E", color: "green" } },
      { x: 2, y: 2, cell: { kind: "splitter", orientation: "/", rotatable: true } },
      { x: 2, y: 0, cell: { kind: "filter", color: "red" } },
      { x: 2, y: 4, cell: { kind: "target", color: "green" } },
      { x: 5, y: 2, cell: { kind: "target" } },
    ],
  };
  assert.deepEqual(solve(data, LIMITS), { status: "solved", moves: [{ x: 2, y: 2 }] });
});

// Brute force: every orientation of every rotatable piece and every placement of up to `inventory` mirrors.
function bruteForce(data: LaserData): number | null {
  const turnable = data.cells.filter((c) => (c.cell.kind === "mirror" || c.cell.kind === "splitter") && c.cell.rotatable);
  const empty: { x: number; y: number }[] = [];
  for (let y = 0; y < data.height; y++) {
    for (let x = 0; x < data.width; x++) if (!data.cells.some((c) => c.x === x && c.y === y)) empty.push({ x, y });
  }
  let best: number | null = null;
  const inventory = data.inventory ?? 0;
  for (let mask = 0; mask < 1 << turnable.length; mask++) {
    const flips = turnable.filter((_, i) => mask & (1 << i)).map((c) => ({ x: c.x, y: c.y }));
    const place = (from: number, moves: LaserMove[], used: number) => {
      const state = replay(data, moves);
      if (isSolved(data, state) && (best === null || moves.length < best)) best = moves.length;
      if (used === inventory) return;
      for (let e = from; e < empty.length; e++) {
        place(e + 1, [...moves, empty[e]!], used + 1);
        place(e + 1, [...moves, empty[e]!, empty[e]!], used + 1);
      }
    };
    place(0, flips, 0);
  }
  return best;
}

test("finds the same minimum as brute force on random small boards", () => {
  let seed = 11;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const orientation = (): Orientation => (random() < 0.5 ? "/" : "\\");
  let solved = 0;
  for (let round = 0; round < 150; round++) {
    const size = 4;
    const data: LaserData = { width: size, height: size, cells: [] };
    const free = Array.from({ length: size * size }, (_, i) => ({ x: i % size, y: Math.floor(i / size) }));
    const take = () => free.splice(Math.floor(random() * free.length), 1)[0]!;
    const colors = ["red", "green"] as const;
    for (let e = 0; e < 1 + Math.floor(random() * 2); e++) {
      const color = colors[e]!;
      data.cells.push({ ...take(), cell: color === "red" ? { kind: "emitter", dir: "E" } : { kind: "emitter", dir: "S", color } });
    }
    for (let t = 0; t < 2; t++) data.cells.push({ ...take(), cell: random() < 0.3 ? { kind: "target", color: "red" } : { kind: "target" } });
    for (let m = 0; m < 3; m++) {
      const kind = random() < 0.25 ? "splitter" : "mirror";
      data.cells.push({ ...take(), cell: { kind, orientation: orientation(), rotatable: random() < 0.7 } });
    }
    if (random() < 0.3) data.cells.push({ ...take(), cell: { kind: "wall" } });
    if (random() < 0.2) data.cells.push({ ...take(), cell: { kind: "filter", color: "green" } });
    const inventory = Math.floor(random() * 3);
    if (inventory > 0) data.inventory = inventory;

    const expected = bruteForce(data);
    const result = solve(data, LIMITS);
    assert.equal(result.status, expected === null ? "unsolvable" : "solved", JSON.stringify(data));
    if (result.status === "solved") {
      solved++;
      assert.equal(result.moves.length, expected, JSON.stringify(data));
      assert.ok(isSolved(data, replay(data, result.moves)));
    }
  }
  assert.ok(solved > 30, `only ${solved} solvable boards`);
});
