import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyMove,
  blockOrigin,
  createDefault,
  exitSpan,
  findProblems,
  initState,
  isSolved,
  legalMoves,
  parseDraft,
  reachable,
  validate,
} from "./logic.ts";
import type { Block, KlotskiData } from "./logic.ts";

const block = (id: string, x: number, y: number, w: number, h: number, target?: true): Block =>
  target ? { id, x, y, w, h, target } : { id, x, y, w, h };

/** 4×5 board, 2×2 target at the top, exit at the bottom in columns 1-2. */
function board(...others: Block[]): KlotskiData {
  return { width: 4, height: 5, blocks: [block("t", 1, 0, 2, 2, true), ...others], exit: { side: "S", index: 1 } };
}

const codes = (data: KlotskiData) => findProblems(data).map((p) => p.code);

test("the default puzzle is valid", () => {
  assert.deepEqual(findProblems(createDefault()), []);
  assert.deepEqual(validate(createDefault()), createDefault());
});

test("findProblems: blocks outside the board and overlapping blocks", () => {
  assert.deepEqual(codes(board(block("a", 3, 4, 2, 1))), ["out-of-bounds"]);
  assert.deepEqual(findProblems(board(block("a", 2, 1, 1, 2))), [{ code: "overlap", block: 1 }]);
  assert.deepEqual(codes(board(block("t", 0, 4, 1, 1))), ["duplicate-id"]);
});

test("findProblems: exactly one target", () => {
  assert.deepEqual(codes({ ...board(), blocks: [block("a", 0, 0, 1, 1)] }), ["no-target"]);
  assert.deepEqual(codes(board(block("u", 0, 3, 2, 2, true))), ["multiple-targets"]);
});

test("findProblems: the exit is as wide as the target and must fit on its side", () => {
  assert.equal(exitSpan(board()), 2);
  assert.deepEqual(codes({ ...board(), exit: { side: "S", index: 3 } }), ["exit-out-of-bounds"]);
  assert.deepEqual(codes({ ...board(), exit: { side: "E", index: 3 } }), []); // rows 3-4
  assert.deepEqual(codes({ ...board(), exit: { side: "E", index: 4 } }), ["exit-out-of-bounds"]);
  const thin: KlotskiData = { ...board(), blocks: [block("t", 0, 0, 1, 2, true)], exit: { side: "N", index: 3 } };
  assert.equal(exitSpan(thin), 1);
  assert.deepEqual(codes(thin), []);
});

test("parseDraft rejects malformed data and keeps drafts with problems", () => {
  const bad = [
    null,
    [],
    { ...board(), width: 2 },
    { ...board(), height: 11 },
    { ...board(), blocks: "x" },
    { ...board(), blocks: [{ ...block("a", 0, 0, 3, 1) }] }, // larger blocks are not supported (yet)
    { ...board(), blocks: [{ ...block("a", 0, 0, 1, 1), target: false }] },
    { ...board(), blocks: [{ ...block("", 0, 0, 1, 1) }] },
    { ...board(), blocks: [{ ...block("a", 1.5, 0, 1, 1) }] },
    { ...board(), exit: { side: "X", index: 0 } },
    { ...board(), exit: { side: "S", index: -1 } },
  ];
  for (const raw of bad) assert.throws(() => parseDraft(raw), JSON.stringify(raw));
  const draft = { ...board(), blocks: [] };
  assert.deepEqual(parseDraft(draft), draft);
  assert.throws(() => validate(draft), /no-target/);
});

test("parseDraft drops unknown fields", () => {
  const raw = { ...board(), extra: 1, blocks: [{ ...block("t", 1, 0, 2, 2, true), color: "red" }] };
  assert.deepEqual(parseDraft(raw), board());
});

test("reachable: a block slides over free cells, also around corners", () => {
  // Single free cells: (0,4) and (3,4); a 1×1 block at (1,4) with (2,4) taken can only go left.
  const data = board(
    block("a", 0, 0, 1, 2),
    block("b", 3, 0, 1, 2),
    block("c", 0, 2, 1, 2),
    block("d", 3, 2, 1, 2),
    block("e", 1, 2, 2, 1),
    block("f", 1, 3, 1, 1),
    block("g", 2, 3, 1, 1),
    block("h", 1, 4, 1, 1),
    block("i", 2, 4, 1, 1),
  );
  const state = initState(data);
  assert.deepEqual(reachable(data, state, 8), [16]); // h: (1,4) → (0,4)
  assert.deepEqual(reachable(data, state, 0), []); // the target is stuck
  // f at (1,3): down is taken, so nothing.
  assert.deepEqual(reachable(data, state, 6), []);

  // Around corners: from (0,0) past the blocker in column 1 (rows 0-1) to (3,0) via row 2.
  const open: KlotskiData = {
    ...board(),
    blocks: [block("t", 2, 3, 2, 2, true), block("a", 0, 0, 1, 1), block("w", 1, 0, 1, 2)],
  };
  const cells = reachable(open, initState(open), 1).map((p) => `${p % 4},${Math.floor(p / 4)}`);
  assert.ok(cells.includes("3,0"), "around the corners to (3,0)");
  assert.ok(cells.includes("1,4"));
  assert.ok(!cells.includes("1,1") && !cells.includes("2,3"), "not onto other blocks");
});

test("applyMove moves a block to a reachable cell as one move and keeps the state unchanged", () => {
  const data = board(block("a", 0, 0, 1, 1));
  const state = initState(data);
  const next = applyMove(data, state, { block: 1, x: 3, y: 4 }); // down and right, around the target
  assert.ok(next);
  assert.deepEqual(blockOrigin(data, next, 1), { x: 3, y: 4 });
  assert.deepEqual(state.pos, [1, 0]);
});

test("applyMove rejects unreachable, occupied and malformed moves", () => {
  const data = board(block("a", 0, 0, 1, 1), block("b", 0, 2, 2, 1), block("c", 2, 2, 2, 1));
  const state = initState(data);
  assert.equal(applyMove(data, state, { block: 1, x: 0, y: 4 }), null); // row 2 is a wall
  assert.equal(applyMove(data, state, { block: 1, x: 1, y: 0 }), null); // occupied by the target
  assert.equal(applyMove(data, state, { block: 1, x: 0, y: 0 }), null); // no movement
  assert.equal(applyMove(data, state, { block: 9, x: 0, y: 1 }), null);
  assert.equal(applyMove(data, state, { block: 1, x: 0.5, y: 1 }), null);
  assert.equal(applyMove(data, state, { block: 1, x: 4, y: 0 }), null);
  assert.ok(applyMove(data, state, { block: 1, x: 0, y: 1 }));
});

test("legalMoves lists every reachable position of every block", () => {
  const data = board(block("a", 0, 0, 1, 1));
  const moves = legalMoves(data, initState(data));
  for (const move of moves) assert.ok(applyMove(data, initState(data), move), JSON.stringify(move));
  // Target: 2×2 on 4×5 has 3·4 = 12 positions; (1,0) is the start and (0,0) collides with a: 10 moves.
  // The 1×1 block reaches every cell not covered by the target: 20 - 4 - 1 = 15.
  assert.equal(moves.filter((m) => m.block === 0).length, 10);
  assert.equal(moves.filter((m) => m.block === 1).length, 15);
});

test("isSolved: the target touches the exit edge, aligned with the exit", () => {
  const at = (x: number, y: number, exit: KlotskiData["exit"]) => {
    const data: KlotskiData = { ...board(), blocks: [block("t", x, y, 2, 2, true)], exit };
    return isSolved(data, initState(data));
  };
  assert.equal(at(1, 3, { side: "S", index: 1 }), true);
  assert.equal(at(2, 3, { side: "S", index: 1 }), false); // at the edge, but not aligned
  assert.equal(at(1, 2, { side: "S", index: 1 }), false);
  assert.equal(at(0, 0, { side: "N", index: 0 }), true);
  assert.equal(at(0, 2, { side: "W", index: 2 }), true);
  assert.equal(at(2, 1, { side: "E", index: 1 }), true);
  assert.equal(at(2, 1, { side: "E", index: 0 }), false);
  const noTarget: KlotskiData = { ...board(), blocks: [] };
  assert.equal(isSolved(noTarget, initState(noTarget)), false);
});
