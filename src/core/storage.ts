import { sha256Hex } from "./hash.ts";
import { sniffImageType } from "./images.ts";
import type { ImageType } from "./images.ts";
import type { PuzzleDocument } from "./types.ts";

/** An own puzzle in the library. `doc` may be a draft that is not playable yet. */
export type PuzzleRecord = { id: string; doc: PuzzleDocument; updatedAt: string };

/**
 * Progress of a played puzzle, keyed by its content (see progressKey). `bestTimeMs` (M25) is missing in records
 * from older app versions; it is optional, so the database needs no new version.
 */
export type ProgressRecord = { key: string; solved: boolean; bestMoves: number; bestTimeMs?: number };

/** A picture of an own puzzle (M14), keyed by the SHA-256 of its bytes. */
export type ImageRecord = { key: string; type: ImageType; bytes: Uint8Array };

export type Storage = {
  listPuzzles(): Promise<PuzzleRecord[]>; // newest first
  getPuzzle(id: string): Promise<PuzzleRecord | null>;
  putPuzzle(record: PuzzleRecord): Promise<void>;
  deletePuzzle(id: string): Promise<void>;
  listProgress(): Promise<ProgressRecord[]>;
  putProgress(record: ProgressRecord): Promise<void>;
  getImage(key: string): Promise<ImageRecord | null>;
  putImage(record: ImageRecord): Promise<void>;
  listImageKeys(): Promise<string[]>;
  deleteImage(key: string): Promise<void>;
};

const DB_NAME = "raetsel";
const DB_VERSION = 2; // 2: images

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

function idbStorage(db: IDBDatabase): Storage {
  function run<T>(name: string, mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>) {
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(name, mode);
      const request = op(tx.objectStore(name));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = tx.onabort = () => reject(tx.error ?? request.error);
    });
  }
  return {
    listPuzzles: async () => sortNewestFirst((await run("puzzles", "readonly", (s) => s.getAll())).filter(isPuzzleRecord)),
    getPuzzle: async (id) => {
      const record: unknown = await run("puzzles", "readonly", (s) => s.get(id));
      return isPuzzleRecord(record) ? record : null;
    },
    putPuzzle: async (record) => void (await run("puzzles", "readwrite", (s) => s.put(record))),
    deletePuzzle: async (id) => void (await run("puzzles", "readwrite", (s) => s.delete(id))),
    listProgress: async () => (await run("progress", "readonly", (s) => s.getAll())).filter(isProgressRecord),
    putProgress: async (record) => void (await run("progress", "readwrite", (s) => s.put(record))),
    getImage: async (key) => {
      const record: unknown = await run("images", "readonly", (s) => s.get(key));
      return isImageRecord(record) ? record : null;
    },
    putImage: async (record) => void (await run("images", "readwrite", (s) => s.put(record))),
    listImageKeys: async () => (await run("images", "readonly", (s) => s.getAllKeys())).filter((k) => typeof k === "string"),
    deleteImage: async (key) => void (await run("images", "readwrite", (s) => s.delete(key))),
  };
}

/** Same behavior as the IndexedDB storage, kept in memory. For tests and as a fallback. */
export function memoryStorage(): Storage {
  const puzzles = new Map<string, PuzzleRecord>();
  const progress = new Map<string, ProgressRecord>();
  const images = new Map<string, ImageRecord>();
  // Structured clones, like IndexedDB: callers never share objects with the storage.
  return {
    listPuzzles: async () => sortNewestFirst([...puzzles.values()].map((r) => structuredClone(r))),
    getPuzzle: async (id) => structuredClone(puzzles.get(id) ?? null),
    putPuzzle: async (record) => void puzzles.set(record.id, structuredClone(record)),
    deletePuzzle: async (id) => void puzzles.delete(id),
    listProgress: async () => [...progress.values()].map((r) => structuredClone(r)),
    putProgress: async (record) => void progress.set(record.key, structuredClone(record)),
    getImage: async (key) => structuredClone(images.get(key) ?? null),
    putImage: async (record) => void images.set(record.key, structuredClone(record)),
    listImageKeys: async () => [...images.keys()],
    deleteImage: async (key) => void images.delete(key),
  };
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
