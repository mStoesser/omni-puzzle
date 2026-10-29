import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyMove,
  blockOrigin,
  createDefault,
  findProblems,
  initState,
  isSolved,
  legalMoves,
  moveRange,
  parseDraft,
  validate,
} from "./logic.ts";
import type { Block, RushHourData } from "./logic.ts";

const target: Block = { id: "t", x: 0, y: 2, length: 2, axis: "h", target: true };

function puzzle(blocks: Block[], exit: RushHourData["exit"] = { side: "E", index: 2 }): RushHourData {
  return { width: 6, height: 6, blocks, exit };
}

const codes = (data: RushHourData) => findProblems(data).map((p) => p.code);

// --- validate / findProblems ---

test("the default puzzle is valid", () => {
  assert.deepEqual(findProblems(createDefault()), []);
  assert.deepEqual(validate(createDefault()), createDefault());
});

test("detects overlapping blocks", () => {
  const data = puzzle([target, { id: "a", x: 1, y: 1, length: 2, axis: "v" }]);
  assert.deepEqual(findProblems(data), [{ code: "overlap", block: 1 }]);
});

test("detects blocks outside the board", () => {
  assert.deepEqual(codes(puzzle([target, { id: "a", x: 5, y: 0, length: 2, axis: "h" }])), ["out-of-bounds"]);
  assert.deepEqual(codes(puzzle([target, { id: "a", x: 0, y: 5, length: 2, axis: "v" }])), ["out-of-bounds"]);
});

test("detects missing and multiple target blocks", () => {
  assert.deepEqual(codes(puzzle([{ ...target, target: undefined } as Block])), ["no-target"]);
  assert.deepEqual(codes(puzzle([target, { ...target, id: "u", y: 3 }])), ["multiple-targets"]);
});

test("detects a target axis that does not match the exit side", () => {
  const vertical: Block = { id: "t", x: 2, y: 0, length: 2, axis: "v", target: true };
  assert.deepEqual(codes(puzzle([vertical], { side: "E", index: 2 })), ["exit-axis"]);
  assert.deepEqual(codes(puzzle([target], { side: "S", index: 0 })), ["exit-axis"]);
  assert.deepEqual(codes(puzzle([vertical], { side: "S", index: 2 })), []);
});

test("detects a target outside the exit lane and exits outside the board", () => {
  assert.deepEqual(codes(puzzle([target], { side: "E", index: 3 })), ["exit-lane"]);
  assert.deepEqual(codes(puzzle([target], { side: "W", index: 6 })).includes("exit-out-of-bounds"), true);
});

test("detects duplicate block ids", () => {
  assert.deepEqual(codes(puzzle([target, { id: "t", x: 0, y: 0, length: 2, axis: "h" }])), ["duplicate-id"]);
});

test("validate rejects malformed data and strips unknown fields", () => {
  for (const raw of [
    null,
    { ...createDefault(), width: 2 },
    { ...createDefault(), width: 13 },
    { ...createDefault(), blocks: "x" },
    { ...createDefault(), blocks: [{ ...target, axis: "d" }] },
    { ...createDefault(), blocks: [{ ...target, x: 1.5 }] },
    { ...createDefault(), blocks: [{ ...target, id: "x".repeat(17) }] },
    { ...createDefault(), blocks: [{ ...target, target: "yes" }] },
    { ...createDefault(), exit: { side: "X", index: 0 } },
    { ...createDefault(), exit: { side: "E", index: 3 } },
  ]) {
    assert.throws(() => validate(raw), Error, JSON.stringify(raw));
  }
  const dirty = { ...createDefault(), evil: 1, blocks: [{ ...target, color: "red" }] };
  assert.deepEqual(validate(dirty), createDefault());
});

test("parseDraft accepts drafts with problems but rejects malformed data", () => {
  const draft = { ...puzzle([target, { id: "a", x: 1, y: 2, length: 2, axis: "h" }]), extra: 1 };
  assert.deepEqual(parseDraft(draft), puzzle(draft.blocks));
  assert.throws(() => validate(draft), Error);
  assert.throws(() => parseDraft({ ...createDefault(), width: 2 }), Error);
  assert.throws(() => parseDraft({ ...createDefault(), blocks: [{ ...target, axis: "d" }] }), Error);
});

// --- moves ---

// Row 2: target at x 0-1, vertical blocker at x 4 (rows 1-3).
const blocked = puzzle([target, { id: "a", x: 4, y: 1, length: 3, axis: "v" }]);

test("initState takes positions along each axis", () => {
  assert.deepEqual(initState(blocked).pos, [0, 1]);
});

test("moveRange stops at walls and blocks", () => {
  const s = initState(blocked);
  assert.deepEqual(moveRange(blocked, s, 0), { min: 0, max: 2 });
  assert.deepEqual(moveRange(blocked, s, 1), { min: -1, max: 2 });
});

test("applyMove moves within the range and rejects collisions and walls", () => {
  const s = initState(blocked);
  assert.deepEqual(applyMove(blocked, s, { block: 0, delta: 2 })?.pos, [2, 1]);
  assert.equal(applyMove(blocked, s, { block: 0, delta: 3 }), null); // hits the blocker
  assert.equal(applyMove(blocked, s, { block: 0, delta: -1 }), null); // left wall
  assert.equal(applyMove(blocked, s, { block: 1, delta: 3 }), null); // bottom wall
  assert.deepEqual(applyMove(blocked, s, { block: 1, delta: -1 })?.pos, [0, 0]);
});

test("applyMove rejects malformed moves", () => {
  const s = initState(blocked);
  for (const move of [
    { block: 0, delta: 0 },
    { block: 0, delta: 0.5 },
    { block: -1, delta: 1 },
    { block: 2, delta: 1 },
  ]) {
    assert.equal(applyMove(blocked, s, move), null, JSON.stringify(move));
  }
});

test("applyMove does not mutate the state", () => {
  const s = initState(blocked);
  applyMove(blocked, s, { block: 0, delta: 1 });
  assert.deepEqual(s.pos, [0, 1]);
});

test("blocks cannot jump over other blocks", () => {
  const data = puzzle([target, { id: "a", x: 3, y: 2, length: 1, axis: "v" }]);
  assert.equal(applyMove(data, initState(data), { block: 0, delta: 3 }), null);
});

test("legalMoves lists every reachable slide", () => {
  assert.deepEqual(legalMoves(blocked, initState(blocked)), [
    { block: 0, delta: 1 },
    { block: 0, delta: 2 },
    { block: 1, delta: -1 },
    { block: 1, delta: 1 },
    { block: 1, delta: 2 },
  ]);
});

test("blockOrigin returns the top-left cell", () => {
  const s = initState(blocked);
  assert.deepEqual(blockOrigin(blocked, s, 0), { x: 0, y: 2 });
  assert.deepEqual(blockOrigin(blocked, s, 1), { x: 4, y: 1 });
});

// --- isSolved ---

test("isSolved when the target touches the exit edge, for every side", () => {
  const east = puzzle([target]);
  assert.equal(isSolved(east, { pos: [3] }), false);
  assert.equal(isSolved(east, { pos: [4] }), true);

  const west = puzzle([target], { side: "W", index: 2 });
  assert.equal(isSolved(west, { pos: [0] }), true);
  assert.equal(isSolved(west, { pos: [1] }), false);

  const vertical: Block = { id: "t", x: 3, y: 2, length: 3, axis: "v", target: true };
  const north = puzzle([vertical], { side: "N", index: 3 });
  assert.equal(isSolved(north, { pos: [0] }), true);
  const south = puzzle([vertical], { side: "S", index: 3 });
  assert.equal(isSolved(south, { pos: [2] }), false);
  assert.equal(isSolved(south, { pos: [3] }), true);
});
