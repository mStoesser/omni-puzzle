import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_EDITOR_HISTORY,
  canRedoEdit,
  canUndoEdit,
  createEditorSession,
  currentData,
  readiness,
  redoEdit,
  setTitle,
  toDocument,
  undoEdit,
  updateData,
} from "./editor-session.ts";
import type { EditorCheck } from "./editor-session.ts";

test("update, undo and redo", () => {
  const a = { n: 1 };
  const b = { n: 2 };
  const c = { n: 3 };
  let s = updateData(updateData(createEditorSession(a, "T"), b), c);
  assert.equal(currentData(s), c);
  s = undoEdit(s);
  assert.equal(currentData(s), b);
  assert.equal(canRedoEdit(s), true);
  s = redoEdit(s);
  assert.equal(currentData(s), c);
  assert.equal(canRedoEdit(s), false);
});

test("updating with the same data is a no-op", () => {
  const s = createEditorSession({ n: 1 }, "T");
  assert.equal(updateData(s, currentData(s)), s);
});

test("a new edit after undo drops the redo branch", () => {
  const s = updateData(undoEdit(updateData(createEditorSession(1, "T"), 2)), 3);
  assert.deepEqual(s.history, [1, 3]);
  assert.equal(canRedoEdit(s), false);
});

test("undo and redo at the ends are no-ops", () => {
  const s = createEditorSession(1, "T");
  assert.equal(canUndoEdit(s), false);
  assert.equal(undoEdit(s), s);
  assert.equal(redoEdit(s), s);
});

test("history is capped", () => {
  let s = createEditorSession(0, "T");
  for (let i = 1; i <= MAX_EDITOR_HISTORY + 10; i++) s = updateData(s, i);
  assert.equal(s.history.length, MAX_EDITOR_HISTORY);
  assert.equal(currentData(s), MAX_EDITOR_HISTORY + 10);
});

test("changes of one group form a single undo step", () => {
  const [a, b, c, d] = [{ n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }];
  let s = createEditorSession(a, "T");
  s = updateData(s, b, 1); // first cell of a stroke: new entry
  s = updateData(s, c, 1); // further cells replace it
  s = updateData(s, d, 1);
  assert.equal(s.history.length, 2);
  assert.equal(currentData(s), d);
  assert.equal(currentData(undoEdit(s)), a);
});

test("a new group or an ungrouped change starts a new undo step", () => {
  const [a, b, c, d] = [{ n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }];
  let s = updateData(createEditorSession(a, "T"), b, 1);
  s = updateData(s, c, 2);
  s = updateData(s, d);
  assert.deepEqual(s.history, [a, b, c, d]);
});

test("a stroke whose first cell changes nothing does not merge into the previous step", () => {
  const [a, b, c] = [{ n: 1 }, { n: 2 }, { n: 3 }];
  let s = updateData(createEditorSession(a, "T"), b); // an earlier tap
  s = updateData(s, b, 7); // stroke starts on a cell that stays the same: no-op
  s = updateData(s, c, 7); // first real change of the stroke: new entry
  assert.deepEqual(s.history, [a, b, c]);
});

test("undo ends a group", () => {
  const [a, b, c, d] = [{ n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }];
  let s = updateData(updateData(createEditorSession(a, "T"), b), c, 1);
  s = redoEdit(undoEdit(s));
  s = updateData(s, d, 1);
  assert.deepEqual(s.history, [a, b, c, d]);
});

test("setTitle does not touch the history", () => {
  const s = setTitle(updateData(createEditorSession(1, "A"), 2), "B");
  assert.equal(s.title, "B");
  assert.deepEqual(s.history, [1, 2]);
});

const ok: EditorCheck = { problems: [], hasSolver: true, solve: { status: "solved", moves: [] }, verified: true };

test("readiness: a valid, verified, solvable puzzle can be tested and shared", () => {
  assert.deepEqual(readiness(ok), { canTest: true, canShare: true });
});

test("readiness: problems block test play and sharing", () => {
  assert.deepEqual(readiness({ ...ok, problems: ["x"] }), { canTest: false, canShare: false });
});

test("readiness: sharing needs verification and a non-negative solver result", () => {
  assert.equal(readiness({ ...ok, verified: false }).canShare, false);
  assert.equal(readiness({ ...ok, solve: { status: "unsolvable" } }).canShare, false);
  assert.equal(readiness({ ...ok, solve: null }).canShare, false);
  assert.equal(readiness({ ...ok, solve: { status: "aborted" } }).canShare, true);
  assert.equal(readiness({ ...ok, hasSolver: false, solve: null }).canShare, true);
});

test("toDocument keeps a description (M34), trimmed, and leaves out a blank one", () => {
  const session = createEditorSession({ n: 1 }, "Titel");
  const info = { type: "x", typeVersion: 1, createdAt: "2026-11-10T10:00:00.000Z", verified: false, solve: null };
  assert.equal(toDocument(session, { ...info, description: "  Ein Tipp.\n" }).meta.description, "Ein Tipp.");
  assert.equal("description" in toDocument(session, { ...info, description: "   " }).meta, false);
  assert.equal("description" in toDocument(session, info).meta, false);
});

test("toDocument builds the envelope from the current editor state", () => {
  const session = updateData(createEditorSession({ n: 1 }, "Titel"), { n: 2 });
  const info = { type: "x", typeVersion: 3, createdAt: "2026-10-29T10:00:00.000Z" };
  assert.deepEqual(toDocument(session, { ...info, verified: false, solve: null }), {
    format: 1,
    type: "x",
    typeVersion: 3,
    meta: { title: "Titel", createdAt: info.createdAt },
    data: { n: 2 },
  });
  const solved = toDocument(session, { ...info, verified: true, solve: { status: "solved", moves: [1, 2, 3] } });
  assert.deepEqual(solved.meta, { title: "Titel", createdAt: info.createdAt, verified: true, minMoves: 3 });
  assert.equal(toDocument(session, { ...info, verified: false, solve: { status: "aborted" } }).meta.minMoves, undefined);
  const theme = { colors: { board: "#ffffff", line: "#dddddd", wall: "#555555", figure: "#000000", piece: "#333333", accent: "#666666", target: "#222222", done: "#777777" } };
  assert.deepEqual(toDocument(session, { ...info, lang: "en", theme, verified: false, solve: null }).meta, {
    title: "Titel", createdAt: info.createdAt, lang: "en", theme,
  });
});
