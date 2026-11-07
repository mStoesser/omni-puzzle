import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryStorage } from "./storage.ts";
import type { ProgressRecord, PuzzleRecord, Storage } from "./storage.ts";
import {
  SYNC,
  mergeProgress,
  ownerDecision,
  parseRemoteRow,
  readSyncMeta,
  resolvePuzzle,
  syncOnce,
} from "./sync.ts";
import type { PushProgress, PushPuzzle, PushResult, SyncApi } from "./sync.ts";
import { counterDocument } from "./test-fixtures.ts";
import type { PuzzleDocument } from "./types.ts";

const T = (minute: number) => new Date(Date.UTC(2026, 10, 7, 12, minute)).toISOString();
const KEY = (n: number) => n.toString(16).padStart(64, "0");
const record = (id: string, minute: number, target = 3): PuzzleRecord => ({ id, doc: counterDocument(target), updatedAt: T(minute) });
const solved = (key: string, bestMoves: number, bestTimeMs?: number): ProgressRecord =>
  bestTimeMs === undefined ? { key, solved: true, bestMoves } : { key, solved: true, bestMoves, bestTimeMs };

test("resolvePuzzle: the newer change wins, a tie keeps the local one", () => {
  const remote = { kind: "puzzle" as const, id: "a", doc: counterDocument(9), updatedAt: "2026-11-07T12:05:00+00:00", deleted: false, rev: 1 };
  assert.deepEqual(resolvePuzzle(null, null, remote), { action: "put", record: { id: "a", doc: counterDocument(9), updatedAt: T(5) } });
  assert.deepEqual(resolvePuzzle(record("a", 4), null, remote).action, "put");
  assert.deepEqual(resolvePuzzle(record("a", 5), null, remote), { action: "keep", dirty: false });
  assert.deepEqual(resolvePuzzle(record("a", 6), null, remote), { action: "keep", dirty: true });
  // A local deletion counts with its time.
  assert.deepEqual(resolvePuzzle(null, { id: "a", deletedAt: T(6) }, remote), { action: "keep", dirty: true });
  assert.equal(resolvePuzzle(null, { id: "a", deletedAt: T(4) }, remote).action, "put");
  // A remote deletion.
  const gone = { ...remote, doc: null, deleted: true };
  assert.deepEqual(resolvePuzzle(record("a", 4), null, gone), { action: "delete", tombstone: { id: "a", deletedAt: T(5) } });
  assert.deepEqual(resolvePuzzle(record("a", 7), null, gone), { action: "keep", dirty: true });
});

test("mergeProgress keeps solved anywhere and the best moves and time independently", () => {
  assert.deepEqual(mergeProgress(undefined, solved("k", 5)), solved("k", 5));
  assert.deepEqual(mergeProgress(solved("k", 5, 9000), solved("k", 7, 4000)), solved("k", 5, 4000));
  assert.deepEqual(mergeProgress(solved("k", 5), solved("k", 7, 4000)), solved("k", 5, 4000));
  assert.deepEqual(mergeProgress({ key: "k", solved: false, bestMoves: 0 }, solved("k", 7)), solved("k", 7));
  assert.deepEqual(mergeProgress(solved("k", 7), { key: "k", solved: false, bestMoves: 0 }), solved("k", 7));
});

test("parseRemoteRow checks every field and the document", () => {
  const ok = () => true;
  const puzzle = { kind: "puzzle", id: "a", doc: counterDocument(3), updated_at: "2026-11-07T12:00:00+00:00", deleted: false, rev: 4 };
  assert.equal(parseRemoteRow(puzzle, ok)?.kind, "puzzle");
  assert.equal(parseRemoteRow(puzzle, () => false), null);
  assert.equal(parseRemoteRow({ ...puzzle, id: "../x" }, ok), null);
  assert.equal(parseRemoteRow({ ...puzzle, updated_at: "yesterday" }, ok), null);
  assert.equal(parseRemoteRow({ ...puzzle, doc: [] }, ok), null);
  assert.equal(parseRemoteRow({ ...puzzle, rev: "4" }, ok), null);
  assert.deepEqual(parseRemoteRow({ ...puzzle, doc: null, deleted: true }, () => false), {
    kind: "puzzle", id: "a", doc: null, updatedAt: puzzle.updated_at, deleted: true, rev: 4,
  });
  const progress = { kind: "progress", id: KEY(1), solved: true, best_moves: 5, best_time_ms: null, rev: 5 };
  assert.deepEqual(parseRemoteRow(progress, ok), { kind: "progress", record: solved(KEY(1), 5), rev: 5 });
  assert.deepEqual(parseRemoteRow({ ...progress, best_time_ms: 1200 }, ok), { kind: "progress", record: solved(KEY(1), 5, 1200), rev: 5 });
  assert.equal(parseRemoteRow({ ...progress, id: "k" }, ok), null);
  assert.equal(parseRemoteRow({ ...progress, best_moves: -1 }, ok), null);
  assert.equal(parseRemoteRow({ ...progress, solved: false }, ok), null);
  assert.equal(parseRemoteRow({ kind: "other", rev: 1 }, ok), null);
});

test("local changes are marked until they are sent, deletions leave a tombstone", async () => {
  const storage = memoryStorage();
  await storage.putPuzzle(record("a", 1));
  await storage.putProgress(solved(KEY(1), 5));
  const dirty = await storage.listDirty();
  assert.deepEqual(dirty.map((e) => e.key).sort(), [`g:${KEY(1)}`, "p:a"]);

  await storage.putPuzzle(record("a", 2)); // changed again after listing
  await storage.clearDirty(dirty);
  assert.deepEqual((await storage.listDirty()).map((e) => e.key), ["p:a"]);

  await storage.deletePuzzle("a", T(3));
  assert.deepEqual(await storage.listTombstones(), [{ id: "a", deletedAt: T(3) }]);
  await storage.clearDirty(await storage.listDirty());
  assert.deepEqual(await storage.listTombstones(), []); // sent, nothing left to protect

  await storage.putPuzzle(record("b", 4));
  await storage.clearDirty(await storage.listDirty());
  await storage.markAllDirty();
  assert.deepEqual((await storage.listDirty()).map((e) => e.key).sort(), [`g:${KEY(1)}`, "p:b"]);

  await storage.putMeta("owner", "u1");
  await storage.clearLocal();
  assert.deepEqual([await storage.listPuzzles(), await storage.listProgress(), await storage.listDirty()], [[], [], []]);
  assert.equal(await storage.getMeta("owner"), "u1");
});

/** The server side of 0012_sync.sql, in memory: change numbers per account, newer wins, limits. */
function fakeServer(limits: { maxPuzzles: number } = { maxPuzzles: SYNC.maxPuzzles }) {
  type Row = { kind: "puzzle" | "progress"; id: string; rev: number } & Record<string, unknown>;
  const rows = new Map<string, Row>();
  const images = new Map<string, Uint8Array>();
  let rev = 0;
  const calls = { pull: 0, pulled: 0, push: 0, upload: 0 };
  const api: SyncApi = {
    pull: async (after, limit) => {
      calls.pull++;
      const page = [...rows.values()].filter((r) => r.rev > after).sort((a, b) => a.rev - b.rev).slice(0, limit);
      calls.pulled += page.length;
      return structuredClone(page);
    },
    push: async (known, puzzles: PushPuzzle[], progress: PushProgress[]): Promise<PushResult> => {
      calls.push++;
      const base = rev;
      const rejected: PushResult["rejected"] = [];
      for (const p of puzzles) {
        const old = rows.get(`p:${p.id}`);
        if (old && Date.parse(old.updated_at as string) >= Date.parse(p.updated_at)) continue;
        if (!old && p.deleted) continue;
        const live = [...rows.values()].filter((r) => r.kind === "puzzle" && !r.deleted).length;
        if (!p.deleted && (!old || old.deleted) && live >= limits.maxPuzzles) {
          rejected.push({ id: p.id, reason: "limit" });
          continue;
        }
        rows.set(`p:${p.id}`, { kind: "puzzle", id: p.id, doc: p.doc, updated_at: p.updated_at.replace("Z", "+00:00"), deleted: p.deleted, rev: ++rev });
      }
      for (const g of progress) {
        const old = rows.get(`g:${g.key}`);
        const moves = old ? Math.min(old.best_moves as number, g.best_moves) : g.best_moves;
        const times = [old?.best_time_ms, g.best_time_ms].filter((t): t is number => typeof t === "number");
        const ms = times.length ? Math.min(...times) : null;
        if (old && old.best_moves === moves && old.best_time_ms === ms) continue;
        rows.set(`g:${g.key}`, { kind: "progress", id: g.key, solved: true, best_moves: moves, best_time_ms: ms, rev: ++rev });
      }
      return { cursor: base === known ? rev : known, rejected };
    },
    uploadImage: async (_user, key, _type, bytes) => {
      calls.upload++;
      images.set(key, bytes);
    },
    downloadImage: async (_user, key) => images.get(key) ?? new Uint8Array(),
  };
  return { api, rows, images, calls };
}

function device(server: ReturnType<typeof fakeServer>, storage: Storage = memoryStorage(), clock = { minute: 30 }) {
  return {
    storage,
    sync: () =>
      syncOnce({
        api: server.api,
        storage,
        userId: "u1",
        accept: () => true,
        imageKeys: (doc: PuzzleDocument) => ((doc.data as { images?: string[] }).images ?? []),
        now: () => T(clock.minute),
      }),
  };
}

const titles = async (storage: Storage) => (await storage.listPuzzles()).map((r) => `${r.id}:${(r.doc.data as { target: number }).target}`).sort();

test("two devices: new puzzles, edits (newer wins), deletions and progress meet", async () => {
  const server = fakeServer();
  const a = device(server);
  const b = device(server);

  await a.storage.putPuzzle(record("one", 1, 1));
  await a.storage.putProgress(solved(KEY(1), 8, 5000));
  await a.sync();
  assert.deepEqual(await b.sync(), { changed: true, rejected: 0 });
  assert.deepEqual(await titles(b.storage), ["one:1"]);
  assert.deepEqual(await b.storage.listProgress(), [solved(KEY(1), 8, 5000)]);
  assert.deepEqual(await b.storage.listDirty(), []); // pulled data is not sent back

  // Both edit offline; the later edit wins on both devices.
  await a.storage.putPuzzle(record("one", 3, 30));
  await b.storage.putPuzzle(record("one", 2, 20));
  await b.storage.putProgress(solved(KEY(1), 6, 5000)); // solved again in 6 moves, slower (recordSolve keeps 5000)
  await a.storage.putProgress(solved(KEY(1), 8, 3000));
  await b.sync();
  await a.sync();
  await b.sync();
  assert.deepEqual(await titles(a.storage), ["one:30"]);
  assert.deepEqual(await titles(b.storage), ["one:30"]);
  assert.deepEqual(await a.storage.listProgress(), [solved(KEY(1), 6, 3000)]);
  assert.deepEqual(await b.storage.listProgress(), [solved(KEY(1), 6, 3000)]);

  // Deleting on one device removes it on the other; an edit made after the deletion brings it back.
  await a.storage.deletePuzzle("one", T(4));
  await a.sync();
  await b.sync();
  assert.deepEqual(await titles(b.storage), []);
  await a.storage.putPuzzle(record("two", 5, 2));
  await a.sync();
  await b.storage.deletePuzzle("two", T(6));
  await a.storage.putPuzzle(record("two", 7, 7)); // a has not seen the deletion yet, but edits later
  await b.sync();
  await a.sync();
  await b.sync();
  assert.deepEqual(await titles(a.storage), ["two:7"]);
  assert.deepEqual(await titles(b.storage), ["two:7"]);
  for (const d of [a, b]) assert.deepEqual([await d.storage.listDirty(), await d.storage.listTombstones()], [[], []]);
});

test("an older remote change does not overwrite a newer local one that has not been sent", async () => {
  const server = fakeServer();
  const a = device(server);
  const b = device(server);
  await a.storage.putPuzzle(record("x", 1, 1));
  await a.sync();
  await b.storage.putPuzzle(record("x", 2, 2)); // b never pulled, edits later
  await b.sync();
  assert.deepEqual(await titles(b.storage), ["x:2"]);
  await a.sync();
  assert.deepEqual(await titles(a.storage), ["x:2"]);
});

test("the cursor skips the own pushes when nothing else happened", async () => {
  const server = fakeServer();
  const a = device(server);
  for (let i = 0; i < 3; i++) await a.storage.putPuzzle(record(`p${i}`, i));
  await a.sync();
  assert.equal((await readSyncMeta(a.storage, "u1")).cursor, 3);
  server.calls.pulled = 0;
  await a.sync();
  assert.equal(server.calls.pulled, 0);
  assert.equal((await readSyncMeta(a.storage, "u1")).lastSync, T(30));

  // Another device pushes between the pull and the push: the cursor stays, the own pushes come back once.
  const b = device(server);
  await a.storage.putPuzzle(record("p0", 10, 5));
  const push = server.api.push;
  server.api.push = async (...args) => {
    server.api.push = push;
    await b.storage.putPuzzle(record("b", 9));
    await b.sync();
    return push(...args);
  };
  await a.sync();
  assert.equal((await readSyncMeta(a.storage, "u1")).cursor, 3);
  server.calls.pulled = 0;
  assert.deepEqual(await a.sync(), { changed: true, rejected: 0 });
  assert.equal(server.calls.pulled, 2);
  assert.deepEqual(await titles(a.storage), ["b:3", "p0:5", "p1:3", "p2:3"]);
  assert.deepEqual(await a.sync(), { changed: false, rejected: 0 });
});

test("pulling and pushing go in pages", async () => {
  const server = fakeServer();
  const a = device(server);
  const count = SYNC.pullPage + SYNC.pushPuzzles + 5;
  for (let i = 0; i < count; i++) await a.storage.putPuzzle(record(`p${i}`, 1));
  await a.sync();
  assert.equal(server.calls.push, 4); // 50 + 50 + 50 + 5
  const b = device(server);
  await b.sync();
  assert.equal((await b.storage.listPuzzles()).length, count);
});

test("puzzles over the limit stay marked and are counted", async () => {
  const server = fakeServer({ maxPuzzles: 2 });
  const a = device(server);
  for (let i = 0; i < 3; i++) await a.storage.putPuzzle(record(`p${i}`, i));
  assert.deepEqual(await a.sync(), { changed: false, rejected: 1 });
  assert.equal((await a.storage.listDirty()).length, 1);
  await a.storage.deletePuzzle("p0", T(10));
  assert.deepEqual(await a.sync(), { changed: false, rejected: 0 });
  assert.equal((await a.storage.listDirty()).length, 0);
});

test("pictures are uploaded once, before the puzzle that uses them", async () => {
  const server = fakeServer();
  const a = device(server);
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2]);
  await a.storage.putImage({ key: "img1", type: "image/jpeg", bytes });
  const doc = { ...counterDocument(1), data: { target: 1, images: ["img1", "missing"] } };
  await a.storage.putPuzzle({ id: "q", doc, updatedAt: T(1) });
  await a.sync();
  assert.equal(server.calls.upload, 1);
  assert.deepEqual(server.images.get("img1"), bytes);
  await a.storage.putPuzzle({ id: "q", doc, updatedAt: T(2) });
  await a.sync();
  assert.equal(server.calls.upload, 1);
  assert.deepEqual((await readSyncMeta(a.storage, "u1")).uploaded, ["img1"]);
});

test("a failed upload keeps the puzzle for the next sync", async () => {
  const server = fakeServer();
  const a = device(server);
  await a.storage.putImage({ key: "img1", type: "image/jpeg", bytes: new Uint8Array([0xff, 0xd8, 0xff]) });
  await a.storage.putPuzzle({ id: "q", doc: { ...counterDocument(1), data: { target: 1, images: ["img1"] } }, updatedAt: T(1) });
  const upload = server.api.uploadImage;
  server.api.uploadImage = async () => {
    throw new Error("offline");
  };
  const warn = console.warn;
  console.warn = () => {};
  try {
    await a.sync();
  } finally {
    console.warn = warn;
  }
  assert.equal(server.rows.size, 0);
  server.api.uploadImage = upload;
  await a.sync();
  assert.equal(server.rows.size, 1);
});

test("rejected documents are skipped, the cursor still moves", async () => {
  const server = fakeServer();
  const a = device(server);
  await a.storage.putPuzzle(record("x", 1));
  await a.sync();
  const b = memoryStorage();
  await syncOnce({ api: server.api, storage: b, userId: "u1", accept: () => false, imageKeys: () => [], now: () => T(0) });
  assert.deepEqual(await b.listPuzzles(), []);
  assert.equal((await readSyncMeta(b, "u1")).cursor, 1);
});

test("ownerDecision: same account syncs, a fresh device adopts, another account's data needs a decision", () => {
  assert.equal(ownerDecision("u1", "u1", true), "sync");
  assert.equal(ownerDecision(null, "u1", true), "adopt");
  assert.equal(ownerDecision("u2", "u1", true), "ask");
  assert.equal(ownerDecision("u2", "u1", false), "adopt");
});
