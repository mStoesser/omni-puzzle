import { sha256Hex } from "./hash.ts";
import { sniffImageType } from "./images.ts";
import type { ImageType } from "./images.ts";
import type { PuzzleDocument } from "./types.ts";
import { mergeProgress, progressDirtyKey, progressStamp, puzzleDirtyKey, resolvePuzzle, sameProgress } from "./sync.ts";
import type { DirtyEntry, RemoteRow, Tombstone } from "./sync.ts";

/** An own puzzle in the library. `doc` may be a draft that is not playable yet. */
export type PuzzleRecord = { id: string; doc: PuzzleDocument; updatedAt: string };

/**
 * Progress of a played puzzle, keyed by its content (see progressKey). `bestTimeMs` (M25) is missing in records
 * from older app versions; it is optional, so the database needs no new version.
 */
export type ProgressRecord = { key: string; solved: boolean; bestMoves: number; bestTimeMs?: number };

/** A picture of an own puzzle (M14), keyed by the SHA-256 of its bytes. */
export type ImageRecord = { key: string; type: ImageType; bytes: Uint8Array };

/**
 * Local changes (puzzles, deletions, progress) are marked "changed since the last sync" (M27) in the same
 * transaction; changes pulled from the server go through `applyRemote` and are not marked.
 */
export type Storage = {
  listPuzzles(): Promise<PuzzleRecord[]>; // newest first
  getPuzzle(id: string): Promise<PuzzleRecord | null>;
  putPuzzle(record: PuzzleRecord): Promise<void>;
  /** Removes the puzzle and leaves a tombstone, so the deletion reaches the other devices. */
  deletePuzzle(id: string, deletedAt: string): Promise<void>;
  listProgress(): Promise<ProgressRecord[]>;
  putProgress(record: ProgressRecord): Promise<void>;
  getImage(key: string): Promise<ImageRecord | null>;
  putImage(record: ImageRecord): Promise<void>;
  listImageKeys(): Promise<string[]>;
  deleteImage(key: string): Promise<void>;
  // Sync (M27)
  listTombstones(): Promise<Tombstone[]>;
  listDirty(): Promise<DirtyEntry[]>;
  /** Unmarks entries that did not change again since they were listed; a sent tombstone is dropped. */
  clearDirty(entries: readonly DirtyEntry[]): Promise<void>;
  /** Marks every puzzle, tombstone and progress entry, e.g. when the device's data goes into an account. */
  markAllDirty(): Promise<void>;
  /** Merges pulled rows into the local data in one transaction (see resolvePuzzle, mergeProgress). */
  applyRemote(rows: readonly RemoteRow[]): Promise<{ changed: boolean }>;
  getMeta(key: string): Promise<unknown>;
  putMeta(key: string, value: unknown): Promise<void>;
  /** Removes puzzles, tombstones, progress, images and marks; the meta entries stay. */
  clearLocal(): Promise<void>;
};

const DB_NAME = "raetsel";
const DB_VERSION = 3; // 2: images, 3: sync (tombstones, dirty, meta)

export type StorageEvents = {
  /** An older app instance (other tab or installed app) keeps the previous version open; opening waits for it. */
  blocked?(): void;
  /** A newer app instance upgraded the database; this connection was closed and the page must be reloaded. */
  versionChange?(): void;
};

/** Opens the IndexedDB database. Rejects where IndexedDB is unavailable (e.g. some private modes). */
export function openStorage(events: StorageEvents = {}): Promise<Storage> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onblocked = () => events.blocked?.();
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("puzzles")) db.createObjectStore("puzzles", { keyPath: "id" });
      if (!db.objectStoreNames.contains("progress")) db.createObjectStore("progress", { keyPath: "key" });
      if (!db.objectStoreNames.contains("images")) db.createObjectStore("images", { keyPath: "key" });
      if (!db.objectStoreNames.contains("tombstones")) db.createObjectStore("tombstones", { keyPath: "id" });
      if (!db.objectStoreNames.contains("dirty")) db.createObjectStore("dirty", { keyPath: "key" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
    };
    request.onsuccess = () => {
      const db = request.result;
      // Let a newer version upgrade instead of blocking it like described above.
      db.onversionchange = () => {
        db.close();
        events.versionChange?.();
      };
      resolve(idbStorage(db));
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * The data behind both storages: a set of stores that one operation reads and writes together.
 * `Tables` hides whether that is an IndexedDB transaction or plain maps, so the rules exist only once.
 */
type StoreName = "puzzles" | "progress" | "images" | "tombstones" | "dirty" | "meta";
type Tables = {
  get(store: StoreName, key: string): Promise<unknown>;
  put(store: StoreName, value: unknown, key?: string): void;
  delete(store: StoreName, key: string): void;
  getAll(store: StoreName): Promise<unknown[]>;
  clear(store: StoreName): void;
};
type Run = <T>(stores: StoreName[], mode: IDBTransactionMode, op: (tables: Tables) => Promise<T>) => Promise<T>;

const markDirty = (tables: Tables, key: string, stamp: string) => tables.put("dirty", { key, stamp } satisfies DirtyEntry);

function storageOn(run: Run): Storage {
  const getOne = <T>(store: StoreName, key: string, check: (v: unknown) => v is T) =>
    run([store], "readonly", async (t) => {
      const value = await t.get(store, key);
      return check(value) ? value : null;
    });
  const all = <T>(store: StoreName, check: (v: unknown) => v is T) => run([store], "readonly", async (t) => (await t.getAll(store)).filter(check));
  return {
    listPuzzles: async () => sortNewestFirst(await all("puzzles", isPuzzleRecord)),
    getPuzzle: (id) => getOne("puzzles", id, isPuzzleRecord),
    putPuzzle: (record) =>
      run(["puzzles", "tombstones", "dirty"], "readwrite", async (t) => {
        t.put("puzzles", record);
        t.delete("tombstones", record.id);
        markDirty(t, puzzleDirtyKey(record.id), record.updatedAt);
      }),
    deletePuzzle: (id, deletedAt) =>
      run(["puzzles", "tombstones", "dirty"], "readwrite", async (t) => {
        t.delete("puzzles", id);
        t.put("tombstones", { id, deletedAt } satisfies Tombstone);
        markDirty(t, puzzleDirtyKey(id), deletedAt);
      }),
    listProgress: () => all("progress", isProgressRecord),
    putProgress: (record) =>
      run(["progress", "dirty"], "readwrite", async (t) => {
        t.put("progress", record);
        markDirty(t, progressDirtyKey(record.key), progressStamp(record));
      }),
    getImage: (key) => getOne("images", key, isImageRecord),
    putImage: (record) => run(["images"], "readwrite", async (t) => t.put("images", record)),
    listImageKeys: () => run(["images"], "readonly", async (t) => (await t.getAll("images")).filter(isImageRecord).map((r) => r.key)),
    deleteImage: (key) => run(["images"], "readwrite", async (t) => t.delete("images", key)),

    listTombstones: () => all("tombstones", isTombstone),
    listDirty: () => all("dirty", isDirtyEntry),
    clearDirty: (entries) =>
      run(["dirty", "tombstones"], "readwrite", async (t) => {
        for (const entry of entries) {
          const current = await t.get("dirty", entry.key);
          if (!isDirtyEntry(current) || current.stamp !== entry.stamp) continue; // changed again meanwhile
          t.delete("dirty", entry.key);
          if (entry.key.startsWith("p:")) {
            const tombstone = await t.get("tombstones", entry.key.slice(2));
            if (isTombstone(tombstone) && tombstone.deletedAt === entry.stamp) t.delete("tombstones", tombstone.id);
          }
        }
      }),
    markAllDirty: () =>
      run(["puzzles", "tombstones", "progress", "dirty"], "readwrite", async (t) => {
        for (const r of (await t.getAll("puzzles")).filter(isPuzzleRecord)) markDirty(t, puzzleDirtyKey(r.id), r.updatedAt);
        for (const r of (await t.getAll("tombstones")).filter(isTombstone)) markDirty(t, puzzleDirtyKey(r.id), r.deletedAt);
        for (const r of (await t.getAll("progress")).filter(isProgressRecord)) markDirty(t, progressDirtyKey(r.key), progressStamp(r));
      }),
    applyRemote: (rows) =>
      run(["puzzles", "tombstones", "progress", "dirty"], "readwrite", async (t) => {
        let changed = false;
        for (const row of rows) {
          if (row.kind === "puzzle") {
            const dirtyKey = puzzleDirtyKey(row.id);
            const local = await t.get("puzzles", row.id);
            const tombstone = await t.get("tombstones", row.id);
            const result = resolvePuzzle(isPuzzleRecord(local) ? local : null, isTombstone(tombstone) ? tombstone : null, row);
            if (result.action === "keep") {
              const current = isPuzzleRecord(local) ? local.updatedAt : isTombstone(tombstone) ? tombstone.deletedAt : null;
              if (result.dirty && current !== null && !(await t.get("dirty", dirtyKey))) markDirty(t, dirtyKey, current);
              continue;
            }
            changed = true;
            t.delete("dirty", dirtyKey);
            if (result.action === "put") {
              t.put("puzzles", result.record);
              t.delete("tombstones", row.id);
            } else {
              t.delete("puzzles", row.id);
              t.delete("tombstones", row.id); // the server has the deletion; nothing left to protect
            }
          } else {
            const key = row.record.key;
            const local = await t.get("progress", key);
            const merged = mergeProgress(isProgressRecord(local) ? local : undefined, row.record);
            if (!isProgressRecord(local) || !sameProgress(local, merged)) {
              t.put("progress", merged);
              changed = true;
            }
            if (sameProgress(merged, row.record)) t.delete("dirty", progressDirtyKey(key));
            else markDirty(t, progressDirtyKey(key), progressStamp(merged));
          }
        }
        return { changed };
      }),
    getMeta: (key) => run(["meta"], "readonly", (t) => t.get("meta", key)),
    putMeta: (key, value) => run(["meta"], "readwrite", async (t) => t.put("meta", value, key)),
    clearLocal: () =>
      run(["puzzles", "tombstones", "progress", "images", "dirty"], "readwrite", async (t) => {
        for (const store of ["puzzles", "tombstones", "progress", "images", "dirty"] as const) t.clear(store);
      }),
  };
}

function idbStorage(db: IDBDatabase): Storage {
  // Reads resolve from request callbacks, so the transaction stays active across the awaits in `op`.
  const request = <T>(r: IDBRequest<T>) =>
    new Promise<T>((resolve, reject) => {
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  return storageOn((stores, mode, op) => {
    const tx = db.transaction(stores, mode);
    const tables: Tables = {
      get: (store, key) => request(tx.objectStore(store).get(key)),
      put: (store, value, key) => void (key === undefined ? tx.objectStore(store).put(value) : tx.objectStore(store).put(value, key)),
      delete: (store, key) => void tx.objectStore(store).delete(key),
      getAll: (store) => request(tx.objectStore(store).getAll()),
      clear: (store) => void tx.objectStore(store).clear(),
    };
    return new Promise((resolve, reject) => {
      let result: unknown;
      op(tables).then(
        (value) => (result = value),
        (error) => {
          tx.abort();
          reject(error);
        },
      );
      tx.oncomplete = () => resolve(result as Awaited<ReturnType<typeof op>>);
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  });
}

/** Same behavior as the IndexedDB storage, kept in memory. For tests and as a fallback. */
export function memoryStorage(): Storage {
  const maps = new Map<StoreName, Map<string, unknown>>();
  const map = (store: StoreName) => maps.get(store) ?? maps.set(store, new Map()).get(store)!;
  const KEY_PATH: Record<StoreName, string | null> = { puzzles: "id", progress: "key", images: "key", tombstones: "id", dirty: "key", meta: null };
  // Structured clones, like IndexedDB: callers never share objects with the storage.
  const tables: Tables = {
    get: async (store, key) => structuredClone(map(store).get(key) ?? undefined),
    put: (store, value, key) => {
      const path = KEY_PATH[store];
      map(store).set(path ? String((value as Record<string, unknown>)[path]) : key!, structuredClone(value));
    },
    delete: (store, key) => void map(store).delete(key),
    getAll: async (store) => [...map(store).values()].map((v) => structuredClone(v)),
    clear: (store) => map(store).clear(),
  };
  return storageOn((_stores, _mode, op) => op(tables));
}

function sortNewestFirst(records: PuzzleRecord[]): PuzzleRecord[] {
  return records.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
}

// Records are checked on read; the document inside goes through loadDocument when opened.
function isPuzzleRecord(value: unknown): value is PuzzleRecord {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return typeof r.id === "string" && typeof r.updatedAt === "string" && typeof r.doc === "object" && r.doc !== null;
}

function isImageRecord(value: unknown): value is ImageRecord {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return typeof r.key === "string" && r.bytes instanceof Uint8Array && sniffImageType(r.bytes) === r.type;
}

function isTombstone(value: unknown): value is Tombstone {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return typeof r.id === "string" && typeof r.deletedAt === "string";
}

function isDirtyEntry(value: unknown): value is DirtyEntry {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return typeof r.key === "string" && typeof r.stamp === "string";
}

function isProgressRecord(value: unknown): value is ProgressRecord {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.key === "string" &&
    typeof r.solved === "boolean" &&
    Number.isInteger(r.bestMoves) &&
    (r.bestTimeMs === undefined || (typeof r.bestTimeMs === "number" && r.bestTimeMs >= 0))
  );
}

/**
 * Random id for a new library entry (fits the router's local id pattern): a version 4 UUID.
 * Built from getRandomValues, because crypto.randomUUID only exists in secure contexts
 * (not on the dev server over the LAN, http://192.168.…).
 */
export function newPuzzleId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant 10xx
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** A copy of a puzzle under a new id. */
export function copyRecord(record: PuzzleRecord, id: string, title: string, now: string): PuzzleRecord {
  return { id, doc: { ...record.doc, meta: { ...record.doc.meta, title, createdAt: now } }, updatedAt: now };
}

/**
 * Identifies a puzzle by its content, so progress is shared between an example,
 * a share link and a library copy of the same puzzle. Edits lead to a new key.
 */
export function progressKey(doc: PuzzleDocument): string {
  return sha256Hex(JSON.stringify([doc.type, doc.typeVersion, doc.data]));
}

/** Progress after solving with `moves` moves in `timeMs`; keeps the best moves and, independently, the best time. */
export function recordSolve(previous: ProgressRecord | undefined, key: string, moves: number, timeMs?: number): ProgressRecord {
  const bestMoves = previous?.solved ? Math.min(previous.bestMoves, moves) : moves;
  const record: ProgressRecord = { key, solved: true, bestMoves };
  const times = [previous?.solved ? previous.bestTimeMs : undefined, timeMs].filter((t) => t !== undefined);
  if (times.length > 0) record.bestTimeMs = Math.min(...times);
  return record;
}
