import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyMove,
  canTurn,
  connected,
  createDefault,
  currentMasks,
  findProblems,
  initState,
  isSolved,
  openEnds,
  parseDraft,
  rotateMask,
  validate,
} from "./logic.ts";
import type { PipesData } from "./logic.ts";

// Masks: N = 1, E = 2, S = 4, W = 8 (hex digit per cell).

test("rotateMask turns clockwise: N→E→S→W→N", () => {
  assert.equal(rotateMask(1, 1), 2);
  assert.equal(rotateMask(8, 1), 1);
  assert.equal(rotateMask(3, 1), 6); // curve N+E → E+S
  assert.equal(rotateMask(5, 1), 10); // straight N–S → E–W
  assert.equal(rotateMask(5, 2), 5);
  assert.equal(rotateMask(7, 4), 7);
  assert.equal(rotateMask(7, 7), rotateMask(7, 3));
  assert.equal(canTurn(0), false);
  assert.equal(canTurn(15), false);
  assert.equal(canTurn(5), true);
});

test("the default puzzle is valid and solved by one turn of the straight", () => {
  const data = createDefault();
  assert.deepEqual(validate(data), data);
  const state = initState(data);
  assert.equal(isSolved(data, state), false);
  assert.equal(isSolved(data, applyMove(data, state, { x: 1, y: 1 })!), true);
});

test("solved when all ends meet and every pipe is connected to the source", () => {
  // Source end pointing east into an end pointing west: closed and connected.
  const closed: PipesData = { rows: ["000", "280", "000"], source: { x: 0, y: 1 }, fixed: [] };
  assert.equal(isSolved(closed, initState(closed)), true);
  // A second, separate closed pair is not connected to the source.
  const apart: PipesData = { rows: ["280", "000", "280"], source: { x: 0, y: 0 }, fixed: [] };
  assert.equal(openEnds(apart, currentMasks(apart, initState(apart))), 0);
  assert.equal(isSolved(apart, initState(apart)), false);
  // An end pointing off the board is open.
  const edge: PipesData = { rows: ["000", "a80", "000"], source: { x: 0, y: 1 }, fixed: [] };
  assert.equal(isSolved(edge, initState(edge)), false);
});

test("loops are allowed", () => {
  // Four curves forming a ring.
  const ring: PipesData = { rows: ["6c0", "390", "000"], source: { x: 0, y: 0 }, fixed: [] };
  assert.equal(isSolved(ring, initState(ring)), true);
});

test("connected gives the distance from the source along meeting pipe ends", () => {
  const line: PipesData = { rows: ["2a8", "000", "000"], source: { x: 0, y: 0 }, fixed: [] };
  const masks = currentMasks(line, initState(line));
  assert.deepEqual([...connected(line, masks)], [[0, 0], [1, 1], [2, 2]]);
  const broken: PipesData = { ...line, rows: ["258", "000", "000"] };
  assert.deepEqual([...connected(broken, currentMasks(broken, initState(broken))).keys()], [0]);
});

test("applyMove turns a tile and counts the turns; empty, cross and fixed tiles do not turn", () => {
  const data: PipesData = { rows: ["2f0", "300", "000"], source: { x: 0, y: 0 }, fixed: [3] };
  const state = initState(data);
  const once = applyMove(data, state, { x: 0, y: 0 })!;
  assert.equal(currentMasks(data, once)[0], 4);
  assert.deepEqual(state.turns, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
  let s = once;
  for (let i = 0; i < 3; i++) s = applyMove(data, s, { x: 0, y: 0 })!;
  assert.equal(s.turns[0], 4);
  assert.equal(currentMasks(data, s)[0], 2);
  assert.equal(applyMove(data, state, { x: 1, y: 0 }), null); // cross
  assert.equal(applyMove(data, state, { x: 2, y: 0 }), null); // empty
  assert.equal(applyMove(data, state, { x: 0, y: 1 }), null); // fixed
  assert.equal(applyMove(data, state, { x: 3, y: 0 }), null);
  assert.equal(applyMove(data, state, { x: 0.5, y: 0 }), null);
});

test("findProblems: pipes are needed and the source must be on one", () => {
  assert.deepEqual(findProblems({ rows: ["000", "000", "000"], source: { x: 0, y: 0 }, fixed: [] }), [{ code: "no-pipes" }]);
  assert.deepEqual(findProblems({ rows: ["000", "280", "000"], source: { x: 0, y: 0 }, fixed: [] }), [{ code: "source-empty" }]);
  assert.throws(() => validate({ rows: ["000", "280", "000"], source: { x: 0, y: 0 }, fixed: [] }), /source-empty/);
});

test("parseDraft rejects malformed data and drops unknown fields", () => {
  const ok = { rows: ["2a8", "000", "000"], source: { x: 0, y: 0 }, fixed: [1] };
  const bad = [
    null,
    { ...ok, rows: ["2a", "00", "00"] },
    { ...ok, rows: ["2a8", "000"] },
    { ...ok, rows: ["2a8", "0000", "000"] },
    { ...ok, rows: ["2g8", "000", "000"] },
    { ...ok, rows: ["2A8", "000", "000"] },
    { ...ok, source: { x: 3, y: 0 } },
    { ...ok, source: null },
    { ...ok, fixed: [9] },
    { ...ok, fixed: [2, 1] },
    { ...ok, fixed: [1, 1] },
    { ...ok, fixed: "1" },
  ];
  for (const raw of bad) assert.throws(() => parseDraft(raw), JSON.stringify(raw));
  assert.deepEqual(parseDraft({ ...ok, extra: true }), ok);
});
