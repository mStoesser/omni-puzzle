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

test("memory storage keeps images by key", async () => {
  const storage = memoryStorage();
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
  await storage.putImage({ key: "k1", type: "image/jpeg", bytes });
  assert.deepEqual(await storage.getImage("k1"), { key: "k1", type: "image/jpeg", bytes });
  assert.deepEqual(await storage.listImageKeys(), ["k1"]);
  await storage.deleteImage("k1");
  assert.equal(await storage.getImage("k1"), null);
});

test("newPuzzleId is unique and a valid route id", () => {
  const a = newPuzzleId();
  assert.notEqual(a, newPuzzleId());
  assert.deepEqual(parseRoute(`#/edit/${a}`), { name: "edit", id: a });
});

test("newPuzzleId is a version 4 UUID and works without crypto.randomUUID (insecure contexts)", (t) => {
  t.mock.method(crypto, "randomUUID", () => {
    throw new TypeError("crypto.randomUUID is not a function");
  });
  for (let i = 0; i < 50; i++) {
    assert.match(newPuzzleId(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  }
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

test("progressKey depends on type and data only", () => {
  const doc = counterDocument(3);
  const renamed = { ...doc, meta: { ...doc.meta, title: "Anders" } };
  assert.equal(progressKey(doc), progressKey(renamed));
  assert.notEqual(progressKey(doc), progressKey(counterDocument(4)));
  assert.notEqual(progressKey(doc), progressKey({ ...doc, type: "other" }));
});

test("recordSolve keeps the best result", () => {
  const first = recordSolve(undefined, "k", 7);
  assert.deepEqual(first, { key: "k", solved: true, bestMoves: 7 });
  assert.deepEqual(recordSolve(first, "k", 9), { key: "k", solved: true, bestMoves: 7 });
  assert.deepEqual(recordSolve(first, "k", 5), { key: "k", solved: true, bestMoves: 5 });
});

test("recordSolve keeps the best time independently of the best moves", () => {
  const old = { key: "k", solved: true, bestMoves: 7 }; // from an app version without time
  const timed = recordSolve(old, "k", 9, 40_000);
  assert.deepEqual(timed, { key: "k", solved: true, bestMoves: 7, bestTimeMs: 40_000 });
  assert.equal(recordSolve(timed, "k", 5, 60_000).bestTimeMs, 40_000, "fewer moves, but slower");
  assert.equal(recordSolve(timed, "k", 9, 30_000).bestTimeMs, 30_000);
  assert.equal(recordSolve(timed, "k", 9).bestTimeMs, 40_000, "test play without time keeps it");
});
