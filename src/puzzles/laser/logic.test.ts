import { test } from "node:test";
import assert from "node:assert/strict";
import { DIRS } from "../../core/grid.ts";
import {
  applyMove,
  createDefault,
  findProblems,
  flip,
  initState,
  isSolved,
  parseDraft,
  reflect,
  traceBeams,
  validate,
} from "./logic.ts";
import type { LaserCell, LaserData, PlacedCell } from "./logic.ts";

const at = (x: number, y: number, cell: LaserCell): PlacedCell => ({ x, y, cell });
const emitter = (x: number, y: number, dir: "N" | "E" | "S" | "W" = "E") => at(x, y, { kind: "emitter", dir });
const target = (x: number, y: number) => at(x, y, { kind: "target" });
const wall = (x: number, y: number) => at(x, y, { kind: "wall" });
const mirror = (x: number, y: number, orientation: "/" | "\\", rotatable = false) =>
  at(x, y, { kind: "mirror", orientation, rotatable });

function puzzle(cells: PlacedCell[], width = 6, height = 6): LaserData {
  return { width, height, cells };
}

const codes = (data: LaserData) => findProblems(data).map((p) => p.code);

// --- Reflection ---

test("reflection tables match the documented mapping", () => {
  assert.deepEqual(DIRS.map((d) => reflect(d, "/")), ["E", "N", "W", "S"]);
  assert.deepEqual(DIRS.map((d) => reflect(d, "\\")), ["W", "S", "E", "N"]);
  for (const d of DIRS) {
    // Reflecting twice on the same mirror after reversing leads back: mirrors are symmetric.
    assert.equal(reflect(reflect(d, "/"), "/"), d);
    assert.equal(reflect(reflect(d, "\\"), "\\"), d);
  }
  assert.equal(flip("/"), "\\");
  assert.equal(flip("\\"), "/");
});

// --- validate / problems ---

test("the default puzzle is valid and not solved yet", () => {
  const data = createDefault();
  assert.deepEqual(validate(data), data);
  assert.equal(isSolved(data, initState(data)), false);
});

test("detects missing emitter, missing target, duplicates and cells out of bounds", () => {
  assert.deepEqual(codes(puzzle([target(1, 1)])), ["no-emitter"]);
  assert.deepEqual(codes(puzzle([emitter(0, 0)])), ["no-target"]);
  assert.deepEqual(codes(puzzle([emitter(0, 0), target(0, 0)])), ["duplicate-cell"]);
  assert.deepEqual(codes(puzzle([emitter(0, 0), target(6, 0)])), ["out-of-bounds"]);
  assert.deepEqual(findProblems(puzzle([emitter(0, 0), target(2, 2), wall(2, 2)])), [{ code: "duplicate-cell", cell: 2 }]);
});

test("validate rejects malformed data and strips unknown fields", () => {
  const good = createDefault();
  for (const raw of [
    null,
    { ...good, width: 2 },
    { ...good, height: 13 },
    { ...good, cells: "x" },
    { ...good, cells: [{ x: 0, y: 0 }] },
    { ...good, cells: [at(0, 0, { kind: "lava" } as unknown as LaserCell)] },
    { ...good, cells: [at(0, 0, { kind: "emitter", dir: "X" } as unknown as LaserCell)] },
    { ...good, cells: [at(0, 0, { kind: "mirror", orientation: "|", rotatable: true } as unknown as LaserCell)] },
    { ...good, cells: [at(0, 0, { kind: "mirror", orientation: "/" } as unknown as LaserCell)] },
    { ...good, cells: [{ ...target(0, 0), x: 1.5 }] },
    { ...good, cells: Array.from({ length: 145 }, () => target(0, 0)) },
    { ...good, cells: [target(1, 1)] }, // no emitter
  ]) {
    assert.throws(() => validate(raw), Error, JSON.stringify(raw));
  }
  const dirty = { ...good, extra: 1, cells: good.cells.map((c) => ({ ...c, color: "red", cell: { ...c.cell, glow: 1 } })) };
  assert.deepEqual(validate(dirty), good);
});

test("parseDraft accepts drafts with problems", () => {
  const draft = puzzle([target(1, 1)]);
  assert.deepEqual(parseDraft(draft), draft);
  assert.throws(() => validate(draft), Error);
});

// --- Tracing ---

test("a beam goes straight to the edge and lights targets on the way", () => {
  const trace = traceBeams(puzzle([emitter(0, 2), target(3, 2)]), initState(puzzle([])));
  assert.deepEqual(trace.beams, [{ points: [{ x: 0.5, y: 2.5 }, { x: 6, y: 2.5 }], end: "edge" }]);
  assert.deepEqual([...trace.hit], ["3,2"]);
});

test("walls and emitters block the beam at the cell border", () => {
  const data = puzzle([emitter(0, 2), wall(3, 2), target(4, 2), emitter(2, 0, "S")]);
  const trace = traceBeams(data, initState(data));
  assert.deepEqual(trace.beams[0], { points: [{ x: 0.5, y: 2.5 }, { x: 3, y: 2.5 }], end: "blocked" });
  // The second emitter's beam goes down column 2 and is not blocked by the first beam.
  assert.deepEqual(trace.beams[1], { points: [{ x: 2.5, y: 0.5 }, { x: 2.5, y: 6 }], end: "edge" });
  assert.equal(trace.hit.size, 0);
});

test("mirrors reflect the beam, and the beam can pass through several targets", () => {
  // E → "\" turns S → "/" turns W
  const data = puzzle([emitter(0, 0), target(1, 0), mirror(3, 0, "\\"), target(3, 2), mirror(3, 4, "/"), target(1, 4)]);
  const trace = traceBeams(data, initState(data));
  assert.deepEqual(trace.beams[0]!.points, [
    { x: 0.5, y: 0.5 },
    { x: 3.5, y: 0.5 },
    { x: 3.5, y: 4.5 },
    { x: 0, y: 4.5 },
  ]);
  assert.deepEqual([...trace.hit].sort(), ["1,0", "1,4", "3,2"]);
  assert.equal(isSolved(data, initState(data)), true);
});

test("a beam through a mirror ring revisits cells but leaves again", () => {
  // Plain mirrors are reversible, so a beam can cross its own path but never loop
  // (loop detection is a safety net for later extensions such as beam splitters).
  const data = puzzle([
    emitter(0, 1),
    mirror(1, 1, "/"), // E → N; later N → E
    mirror(1, 0, "/"), // N → E
    mirror(3, 0, "\\"), // E → S
    mirror(3, 2, "/"), // S → W
    mirror(1, 2, "\\"), // W → N, back to (1,1)
    target(5, 1),
  ]);
  const trace = traceBeams(data, initState(data));
  assert.equal(trace.beams[0]!.end, "edge");
  assert.deepEqual(trace.beams[0]!.points.at(-1), { x: 6, y: 1.5 });
  assert.equal(isSolved(data, initState(data)), true);
});

test("random mirror mazes never loop", () => {
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let round = 0; round < 200; round++) {
    const cells: PlacedCell[] = [emitter(0, 0)];
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < 6; x++) {
        if ((x > 0 || y > 0) && random() < 0.6) cells.push(mirror(x, y, random() < 0.5 ? "/" : "\\"));
      }
    }
    const data = puzzle(cells);
    assert.notEqual(traceBeams(data, initState(data)).beams[0]!.end, "loop");
  }
});

test("multiple emitters are traced independently", () => {
  const data = puzzle([emitter(0, 0), emitter(5, 5, "N"), target(3, 0), target(5, 2)]);
  const trace = traceBeams(data, initState(data));
  assert.equal(trace.beams.length, 2);
  assert.deepEqual([...trace.hit].sort(), ["3,0", "5,2"]);
  assert.equal(isSolved(data, initState(data)), true);
});

// --- Moves ---

test("tapping a rotatable mirror flips it; fixed mirrors and empty cells are no moves", () => {
  const data = createDefault();
  const state = initState(data);
  assert.deepEqual(state, { orientations: { "4,1": "/" } });
  const next = applyMove(data, state, { x: 4, y: 1 })!;
  assert.deepEqual(next, { orientations: { "4,1": "\\" } });
  assert.deepEqual(state, { orientations: { "4,1": "/" } }, "state is not mutated");
  assert.equal(isSolved(data, next), true);
  assert.equal(applyMove(data, state, { x: 0, y: 0 }), null);

  const fixed = puzzle([emitter(0, 0), mirror(2, 0, "\\"), target(2, 3)]);
  assert.equal(applyMove(fixed, initState(fixed), { x: 2, y: 0 }), null);
});

test("isSolved needs every target", () => {
  const data = puzzle([emitter(0, 0), target(3, 0), target(3, 3)]);
  assert.equal(isSolved(data, initState(data)), false);
});
