import { test } from "node:test";
import assert from "node:assert/strict";
import { applyMove, createDefault, findProblems, initState, isSolved, lightsOn, parseDraft, toggled, validate } from "./logic.ts";
import type { LightsOutData } from "./logic.ts";

const rows = (state: { on: readonly boolean[] }, w: number) =>
  Array.from({ length: state.on.length / w }, (_, y) => state.on.slice(y * w, y * w + w).map((on) => (on ? "*" : ".")).join(""));

test("the default puzzle is valid and solved by one tap in the middle", () => {
  const data = createDefault();
  assert.deepEqual(validate(data), data);
  const next = applyMove(data, initState(data), { x: 2, y: 2 });
  assert.ok(next);
  assert.equal(isSolved(data, next), true);
});

test("a tap toggles the cell and its neighbours, not across holes or edges", () => {
  const data: LightsOutData = { rows: ["...", ".#.", "..."] };
  assert.deepEqual(toggled(data, 0, 0).sort((a, b) => a - b), [0, 1, 3]);
  assert.deepEqual(toggled(data, 1, 0).sort((a, b) => a - b), [0, 1, 2]); // (1,1) is a hole
  const state = applyMove(data, initState(data), { x: 2, y: 2 })!;
  assert.deepEqual(rows(state, 3), ["...", "..*", ".**"]);
  assert.equal(lightsOn(state), 3);
});

test("tapping twice switches everything back and the state is not mutated", () => {
  const data: LightsOutData = { rows: ["*..", "...", "..."] };
  const start = initState(data);
  const once = applyMove(data, start, { x: 1, y: 1 })!;
  assert.deepEqual(rows(start, 3), ["*..", "...", "..."]);
  assert.deepEqual(rows(applyMove(data, once, { x: 1, y: 1 })!, 3), ["*..", "...", "..."]);
});

test("applyMove rejects holes and cells outside the board", () => {
  const data: LightsOutData = { rows: ["...", ".#.", "..."] };
  const state = initState(data);
  for (const move of [{ x: 1, y: 1 }, { x: 3, y: 0 }, { x: -1, y: 0 }, { x: 0.5, y: 0 }]) {
    assert.equal(applyMove(data, state, move), null, JSON.stringify(move));
  }
});

test("solved when all lights are off", () => {
  assert.equal(isSolved({ rows: ["...", "...", "..."] }, initState({ rows: ["...", "...", "..."] })), true);
  const data: LightsOutData = { rows: ["..#", "...", "..*"] };
  assert.equal(isSolved(data, initState(data)), false);
});

test("findProblems: a board needs at least one cell", () => {
  assert.deepEqual(findProblems({ rows: ["###", "###", "###"] }), [{ code: "no-cells" }]);
  assert.throws(() => validate({ rows: ["###", "###", "###"] }), /no-cells/);
  assert.deepEqual(findProblems({ rows: ["###", "#.#", "###"] }), []);
});

test("parseDraft rejects malformed data", () => {
  const bad = [
    null,
    [],
    { rows: "..." },
    { rows: ["...", "..."] }, // too few rows
    { rows: Array(11).fill("...") },
    { rows: ["..", "..", ".."] }, // too narrow
    { rows: ["...........", "...........", "..........."] },
    { rows: ["...", "....", "..."] },
    { rows: ["...", ".x.", "..."] },
    { rows: ["...", 3, "..."] },
  ];
  for (const raw of bad) assert.throws(() => parseDraft(raw), JSON.stringify(raw));
  assert.deepEqual(parseDraft({ rows: ["*.#", "...", "..."], extra: 1 }), { rows: ["*.#", "...", "..."] });
});
