import { test } from "node:test";
import assert from "node:assert/strict";
import { copyRecord, memoryStorage, newPuzzleId, progressKey, recordSolve } from "./storage.ts";
import type { PuzzleRecord } from "./storage.ts";
import { counterDocument } from "./test-fixtures.ts";
import { parseRoute } from "./router.ts";

function record(id: string, updatedAt: string, target = 3): PuzzleRecord {
  return { id, doc: counterDocument(target), updatedAt };
}

test("memory storage stores, lists newest first and deletes puzzles", async () => {
  const storage = memoryStorage();
  await storage.putPuzzle(record("a", "2026-10-01T00:00:00.000Z"));
  await storage.putPuzzle(record("b", "2026-10-03T00:00:00.000Z"));
  await storage.putPuzzle(record("c", "2026-10-02T00:00:00.000Z"));
  assert.deepEqual((await storage.listPuzzles()).map((r) => r.id), ["b", "c", "a"]);

  await storage.putPuzzle(record("a", "2026-10-04T00:00:00.000Z", 9));
  assert.deepEqual((await storage.getPuzzle("a"))?.doc.data, { target: 9 });
  assert.equal((await storage.listPuzzles())[0]!.id, "a");

  await storage.deletePuzzle("b");
  assert.equal(await storage.getPuzzle("b"), null);
  assert.equal((await storage.listPuzzles()).length, 2);
});

test("memory storage does not share objects with callers", async () => {
  const storage = memoryStorage();
  const original = record("a", "2026-10-01T00:00:00.000Z");
  await storage.putPuzzle(original);
  original.doc.meta.title = "changed";
  const loaded = (await storage.getPuzzle("a"))!;
  assert.equal(loaded.doc.meta.title, "Zähler");
  loaded.doc.meta.title = "changed too";
  assert.equal((await storage.getPuzzle("a"))!.doc.meta.title, "Zähler");
});

test("memory storage keeps progress per key", async () => {
  const storage = memoryStorage();
  await storage.putProgress({ key: "k", solved: true, bestMoves: 5 });
  await storage.putProgress({ key: "k", solved: true, bestMoves: 4 });
  assert.deepEqual(await storage.listProgress(), [{ key: "k", solved: true, bestMoves: 4 }]);
});

test("newPuzzleId is unique and a valid route id", () => {
  const a = newPuzzleId();
  assert.notEqual(a, newPuzzleId());
  assert.deepEqual(parseRoute(`#/edit/${a}`), { name: "edit", id: a });
});

test("copyRecord changes id, title and dates but keeps the puzzle", () => {
  const source: PuzzleRecord = {
    id: "a",
    doc: { ...counterDocument(3), meta: { ...counterDocument(3).meta, verified: true, minMoves: 3 } },
    updatedAt: "2026-10-01T00:00:00.000Z",
  };
  const now = "2026-10-29T10:00:00.000Z";
  const copy = copyRecord(source, "b", "Kopie", now);
  assert.deepEqual(copy, {
    id: "b",
    doc: { ...source.doc, meta: { title: "Kopie", createdAt: now, verified: true, minMoves: 3 } },
    updatedAt: now,
  });
  assert.equal(source.doc.meta.title, "Zähler");
});

test("progressKey depends on type and data only", async () => {
  const doc = counterDocument(3);
  const renamed = { ...doc, meta: { ...doc.meta, title: "Anders" } };
  assert.equal(await progressKey(doc), await progressKey(renamed));
  assert.notEqual(await progressKey(doc), await progressKey(counterDocument(4)));
  assert.notEqual(await progressKey(doc), await progressKey({ ...doc, type: "other" }));
});

test("recordSolve keeps the best result", () => {
  const first = recordSolve(undefined, "k", 7);
  assert.deepEqual(first, { key: "k", solved: true, bestMoves: 7 });
  assert.deepEqual(recordSolve(first, "k", 9), { key: "k", solved: true, bestMoves: 7 });
  assert.deepEqual(recordSolve(first, "k", 5), { key: "k", solved: true, bestMoves: 5 });
});
