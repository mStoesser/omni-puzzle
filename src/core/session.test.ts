import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canRedo,
  canUndo,
  createSession,
  currentState,
  dispatch,
  moveCount,
  path,
  redo,
  restart,
  undo,
} from "./session.ts";
import { counterType } from "./test-fixtures.ts";

const start = () => createSession(counterType, { target: 2 });

test("a new session starts at the initial state", () => {
  const s = start();
  assert.equal(currentState(s), 0);
  assert.equal(moveCount(s), 0);
  assert.equal(s.solved, false);
  assert.equal(canUndo(s), false);
  assert.equal(canRedo(s), false);
});

test("dispatch applies moves and counts them", () => {
  const s = dispatch(start(), 1);
  assert.equal(currentState(s), 1);
  assert.equal(moveCount(s), 1);
  assert.equal(canUndo(s), true);
});

test("invalid moves leave the session unchanged", () => {
  const s = start();
  assert.equal(dispatch(s, -1), s);
});

test("dispatch does not mutate the previous session", () => {
  const s0 = start();
  const s1 = dispatch(s0, 1);
  assert.deepEqual(s0.history, [0]);
  assert.deepEqual(s1.history, [0, 1]);
});

test("reaching the target solves the puzzle and blocks further moves", () => {
  const solved = dispatch(dispatch(start(), 1), 1);
  assert.equal(solved.solved, true);
  assert.equal(dispatch(solved, 1), solved);
});

test("undo and redo move through history and update solved", () => {
  const solved = dispatch(dispatch(start(), 1), 1);
  const undone = undo(solved);
  assert.equal(currentState(undone), 1);
  assert.equal(undone.solved, false);
  assert.equal(canRedo(undone), true);
  const redone = redo(undone);
  assert.equal(currentState(redone), 2);
  assert.equal(redone.solved, true);
});

test("undo and redo at the ends are no-ops", () => {
  const s = start();
  assert.equal(undo(s), s);
  assert.equal(redo(s), s);
});

test("a new move after undo discards the redo branch", () => {
  const s = dispatch(undo(dispatch(dispatch(start(), 1), 1)), -1);
  assert.deepEqual(s.history, [0, 1, 0]);
  assert.equal(canRedo(s), false);
  assert.equal(moveCount(s), 2);
});

test("restart returns to the initial state with empty history", () => {
  const s = restart(dispatch(dispatch(start(), 1), 1));
  assert.equal(currentState(s), 0);
  assert.equal(moveCount(s), 0);
  assert.equal(s.solved, false);
  assert.equal(canRedo(s), false);
});

test("path holds the moves to the current state, without undone ones", () => {
  let s = dispatch(dispatch(start(), 1), 1);
  assert.deepEqual(path(s), [1, 1]);
  s = undo(s);
  assert.deepEqual(path(s), [1]);
  assert.deepEqual(path(redo(s)), [1, 1]);
  assert.deepEqual(path(dispatch(s, -1)), [1, -1], "a new move replaces the undone one");
  assert.deepEqual(path(restart(s)), []);
});
