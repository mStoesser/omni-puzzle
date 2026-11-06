import { test } from "node:test";
import assert from "node:assert/strict";
import { DIRS } from "../../core/grid.ts";
import {
  VERSION,
  applyMove,
  createDefault,
  findProblems,
  flip,
  initState,
  inventoryLeft,
  isSolved,
  migrate,
  minVersion,
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
const splitter = (x: number, y: number, orientation: "/" | "\\", rotatable = false) =>
  at(x, y, { kind: "splitter", orientation, rotatable });
const colored = (x: number, y: number, dir: "N" | "E" | "S" | "W", color: "green" | "blue") =>
  at(x, y, { kind: "emitter", dir, color });
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
  assert.deepEqual(trace.beams, [{ points: [{ x: 0.5, y: 2.5 }, { x: 6, y: 2.5 }], color: "red", end: "edge" }]);
  assert.deepEqual([...trace.hit], ["3,2"]);
});

test("walls and emitters block the beam at the cell border", () => {
  const data = puzzle([emitter(0, 2), wall(3, 2), target(4, 2), emitter(2, 0, "S")]);
  const trace = traceBeams(data, initState(data));
  assert.deepEqual(trace.beams[0], { points: [{ x: 0.5, y: 2.5 }, { x: 3, y: 2.5 }], color: "red", end: "blocked" });
  // The second emitter's beam goes down column 2 and is not blocked by the first beam.
  assert.deepEqual(trace.beams[1], { points: [{ x: 2.5, y: 0.5 }, { x: 2.5, y: 6 }], color: "red", end: "edge" });
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
  assert.deepEqual(state, { orientations: { "4,1": "/" }, placed: {} });
  const next = applyMove(data, state, { x: 4, y: 1 })!;
  assert.deepEqual(next, { orientations: { "4,1": "\\" }, placed: {} });
  assert.deepEqual(state, { orientations: { "4,1": "/" }, placed: {} }, "state is not mutated");
  assert.equal(isSolved(data, next), true);
  assert.equal(applyMove(data, state, { x: 0, y: 0 }), null);

  const fixed = puzzle([emitter(0, 0), mirror(2, 0, "\\"), target(2, 3)]);
  assert.equal(applyMove(fixed, initState(fixed), { x: 2, y: 0 }), null);
});

test("isSolved needs every target", () => {
  const data = puzzle([emitter(0, 0), target(3, 0), target(3, 3)]);
  assert.equal(isSolved(data, initState(data)), false);
});

// --- Versions ---

test("version 1 data keeps its exact shape and version", () => {
  const data = createDefault();
  assert.equal(JSON.stringify(validate(data)), JSON.stringify(data));
  assert.equal(minVersion(data), 1);
  assert.equal(migrate(data, 1), data);
  assert.equal(migrate(data, VERSION - 1), data);
  assert.throws(() => migrate(data, 0));
});

test("minVersion follows the extensions a puzzle uses", () => {
  const base = [emitter(0, 0), target(5, 0)];
  assert.equal(minVersion({ ...puzzle(base), inventory: 2 }), 2);
  assert.equal(minVersion(puzzle([...base, splitter(2, 0, "/")])), 3);
  assert.equal(minVersion({ ...puzzle([...base, splitter(2, 0, "/")]), inventory: 1 }), 3);
  assert.equal(minVersion(puzzle([...base, at(3, 3, { kind: "filter", color: "red" })])), 4);
  assert.equal(minVersion(puzzle([colored(0, 0, "E", "blue"), target(5, 0)])), 4);
  assert.equal(minVersion(puzzle([emitter(0, 0), at(5, 0, { kind: "target", color: "red" })])), 4);
});

test("parse normalizes defaults, so equal puzzles look the same", () => {
  const raw = { ...puzzle([at(0, 0, { kind: "emitter", dir: "E", color: "red" }), target(5, 0)]), inventory: 0 };
  assert.deepEqual(validate(raw), puzzle([emitter(0, 0), target(5, 0)]));
  for (const bad of [
    { ...puzzle([emitter(0, 0), target(5, 0)]), inventory: 4 },
    { ...puzzle([emitter(0, 0), target(5, 0)]), inventory: -1 },
    puzzle([at(0, 0, { kind: "emitter", dir: "E", color: "pink" } as unknown as LaserCell), target(5, 0)]),
    puzzle([emitter(0, 0), target(5, 0), at(2, 2, { kind: "filter" } as unknown as LaserCell)]),
    puzzle([emitter(0, 0), target(5, 0), at(2, 2, { kind: "splitter", orientation: "/" } as unknown as LaserCell)]),
  ]) {
    assert.throws(() => validate(bad), Error, JSON.stringify(bad));
  }
});

// --- Inventory ---

test("taps on empty cells place a mirror, flip it and take it back", () => {
  const data: LaserData = { ...puzzle([emitter(0, 0), target(3, 3), wall(5, 5)]), inventory: 1 };
  const s0 = initState(data);
  const s1 = applyMove(data, s0, { x: 3, y: 0 })!;
  assert.deepEqual(s1.placed, { "3,0": "/" });
  assert.equal(inventoryLeft(data, s1), 0);
  const s2 = applyMove(data, s1, { x: 3, y: 0 })!;
  assert.deepEqual(s2.placed, { "3,0": "\\" });
  assert.equal(isSolved(data, s2), true, "the placed mirror sends the beam down to the target");
  assert.equal(applyMove(data, s2, { x: 1, y: 1 }), null, "the inventory is empty");
  const s3 = applyMove(data, s2, { x: 3, y: 0 })!;
  assert.deepEqual(s3.placed, {});
  assert.equal(inventoryLeft(data, s3), 1);
  assert.equal(applyMove(data, s0, { x: 5, y: 5 }), null, "only on empty cells");
  assert.equal(applyMove(data, s0, { x: 6, y: 0 }), null, "only on the board");
  assert.equal(applyMove(puzzle([emitter(0, 0), target(3, 3)]), s0, { x: 3, y: 0 }), null, "no inventory");
});

// --- Splitters ---

test("a splitter lets the beam through and reflects it as well", () => {
  const data = puzzle([emitter(0, 2), splitter(2, 2, "/"), target(5, 2), target(2, 0)]);
  const trace = traceBeams(data, initState(data));
  assert.equal(trace.beams.length, 2);
  assert.deepEqual(trace.beams[0]!.points, [{ x: 0.5, y: 2.5 }, { x: 6, y: 2.5 }]);
  assert.deepEqual(trace.beams[1]!.points, [{ x: 2.5, y: 2.5 }, { x: 2.5, y: 0 }]);
  assert.equal(isSolved(data, initState(data)), true);
});

test("rotatable splitters flip like mirrors", () => {
  const data = puzzle([emitter(0, 2), splitter(2, 2, "/", true), target(2, 5)]);
  const state = applyMove(data, initState(data), { x: 2, y: 2 })!;
  assert.deepEqual(state.orientations, { "2,2": "\\" });
  assert.equal(isSolved(data, state), true);
});

test("splitters can make loops, and the trace stops them", () => {
  // The reflected part circles back into the splitter through three mirrors.
  const data = puzzle([emitter(0, 3), splitter(2, 3, "/"), mirror(2, 1, "/"), mirror(4, 1, "\\"), mirror(4, 3, "/"), target(5, 5)]);
  const trace = traceBeams(data, initState(data));
  assert.ok(trace.beams.some((b) => b.end === "loop"));
  assert.ok(trace.beams.length < 10);
});

// --- Colors ---

test("targets with a color need a beam of that color; others take any beam", () => {
  const red = puzzle([emitter(0, 0), at(3, 0, { kind: "target", color: "red" }), at(3, 2, { kind: "target", color: "green" })]);
  assert.deepEqual([...traceBeams(red, initState(red)).hit], ["3,0"]);
  const green = puzzle([colored(0, 2, "E", "green"), at(3, 2, { kind: "target", color: "green" }), target(5, 2)]);
  assert.deepEqual([...traceBeams(green, initState(green)).hit].sort(), ["3,2", "5,2"]);
  assert.equal(traceBeams(green, initState(green)).beams[0]!.color, "green");
});

test("filters let only their own color through", () => {
  const data = puzzle([
    emitter(0, 0),
    at(2, 0, { kind: "filter", color: "red" }),
    target(4, 0),
    colored(0, 2, "E", "blue"),
    at(2, 2, { kind: "filter", color: "red" }),
    target(4, 2),
  ]);
  const trace = traceBeams(data, initState(data));
  assert.deepEqual([...trace.hit], ["4,0"]);
  assert.deepEqual(trace.beams[1]!.points.at(-1), { x: 2, y: 2.5 });
  assert.equal(trace.beams[1]!.end, "blocked");
});

test("beams of different colors cross the same cells independently", () => {
  const data = puzzle([emitter(0, 0), colored(5, 0, "W", "blue"), at(2, 0, { kind: "target", color: "blue" }), at(3, 0, { kind: "target", color: "red" })]);
  // Each laser stops at the other one, but both pass both targets.
  assert.equal(isSolved(data, initState(data)), true);
});

test("a target that needs a color no laser has is a problem", () => {
  const data = puzzle([emitter(0, 0), at(3, 0, { kind: "target", color: "green" })]);
  assert.deepEqual(findProblems(data), [{ code: "missing-color", cell: 1 }]);
  assert.deepEqual(codes(puzzle([colored(0, 0, "E", "green"), at(3, 0, { kind: "target", color: "green" })])), []);
});
