import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_RESUME_MOVES, parseResume, replay, resumeAction } from "./resume.ts";
import type { Resume } from "./resume.ts";
import { currentState, moveCount, undo } from "./session.ts";
import { counterType } from "./test-fixtures.ts";
import type { AnyPuzzleType } from "./types.ts";

const counter = counterType as unknown as AnyPuzzleType;
const KEY = "a".repeat(64);
const entry = (change: Partial<Record<keyof Resume, unknown>> = {}) => ({
  route: "#/play/counter-1", contentKey: KEY, moves: [1, 1], elapsedMs: 4200, savedAt: "2026-11-11T10:00:00.000Z",
  type: "counter", title: "Zähler", typeVersion: 2, data: { target: 5 }, ...change,
});

test("parseResume keeps a valid entry and its theme", () => {
  assert.deepEqual(parseResume(entry()), entry());
  const theme = { colors: { board: "#ffffff", line: "#dddddd", wall: "#555555", figure: "#000000", piece: "#333333", accent: "#666666", target: "#222222", done: "#777777" } };
  assert.deepEqual(parseResume(entry({ theme }))?.theme, theme);
  assert.equal(parseResume(entry({ theme: "night" }))?.theme, undefined);
});

test("parseResume rejects malformed entries", () => {
  for (const change of [
    { route: "https://evil" }, { contentKey: "x" }, { moves: [] }, { moves: "1,1" }, { moves: new Array(MAX_RESUME_MOVES + 1).fill(1) },
    { elapsedMs: -1 }, { elapsedMs: Infinity }, { typeVersion: 0 }, { data: undefined }, { title: 3 },
  ]) {
    assert.equal(parseResume(entry(change)), null, JSON.stringify(change).slice(0, 60));
  }
  assert.equal(parseResume(null), null);
});

test("replay plays the moves again, with undo history", () => {
  const session = replay(counter, { target: 5 }, [1, 1, 1])!;
  assert.equal(currentState(session), 3);
  assert.equal(moveCount(session), 3);
  assert.equal(currentState(undo(session)), 2);
});

test("replay gives up on a rejected move, a solved end or too many moves", () => {
  assert.equal(replay(counter, { target: 5 }, [1, -1, -1]), null); // below zero is invalid
  assert.equal(replay(counter, { target: 2 }, [1, 1]), null); // solved: nothing to continue
  assert.equal(replay(counter, { target: 2 }, [1, 1, 1]), null); // a move after solving
  assert.equal(replay(counter, { target: 9999 }, new Array(MAX_RESUME_MOVES + 1).fill(1)), null);
});

test("resumeAction: save an attempt with moves, drop it when solved or restarted, never touch another puzzle's", () => {
  const saved = parseResume(entry())!;
  assert.equal(resumeAction({ contentKey: KEY, moves: 3, solved: false }, saved), "save");
  assert.equal(resumeAction({ contentKey: "b".repeat(64), moves: 1, solved: false }, saved), "save"); // replaces it
  assert.equal(resumeAction({ contentKey: KEY, moves: 3, solved: true }, saved), "clear");
  assert.equal(resumeAction({ contentKey: KEY, moves: 0, solved: false }, saved), "clear");
  assert.equal(resumeAction({ contentKey: "b".repeat(64), moves: 0, solved: false }, saved), "keep");
  assert.equal(resumeAction({ contentKey: "b".repeat(64), moves: 4, solved: true }, saved), "keep");
  assert.equal(resumeAction({ contentKey: KEY, moves: MAX_RESUME_MOVES + 1, solved: false }, saved), "keep");
  assert.equal(resumeAction({ contentKey: KEY, moves: 0, solved: false }, null), "keep");
});
