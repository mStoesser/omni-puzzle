import { sha256Hex } from "./hash.ts";
import type { PuzzleDocument } from "./types.ts";

/** An own puzzle in the library. `doc` may be a draft that is not playable yet. */
export type PuzzleRecord = { id: string; doc: PuzzleDocument; updatedAt: string };

/** Progress of a played puzzle, keyed by its content (see progressKey). */
export type ProgressRecord = { key: string; solved: boolean; bestMoves: number };

export type Storage = {
  listPuzzles(): Promise<PuzzleRecord[]>; // newest first
  getPuzzle(id: string): Promise<PuzzleRecord | null>;
  putPuzzle(record: PuzzleRecord): Promise<void>;
  deletePuzzle(id: string): Promise<void>;
  listProgress(): Promise<ProgressRecord[]>;
  putProgress(record: ProgressRecord): Promise<void>;
};

const DB_NAME = "raetsel";
const DB_VERSION = 1;

/** Opens the IndexedDB database. Rejects where IndexedDB is unavailable (e.g. some private modes). */
export function openStorage(): Promise<Storage> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("puzzles")) db.createObjectStore("puzzles", { keyPath: "id" });
      if (!db.objectStoreNames.contains("progress")) db.createObjectStore("progress", { keyPath: "key" });
    };
    request.onsuccess = () => resolve(idbStorage(request.result));
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
  };
}

/** Same behavior as the IndexedDB storage, kept in memory. For tests and as a fallback. */
export function memoryStorage(): Storage {
  const puzzles = new Map<string, PuzzleRecord>();
  const progress = new Map<string, ProgressRecord>();
  // Structured clones, like IndexedDB: callers never share objects with the storage.
  return {
    listPuzzles: async () => sortNewestFirst([...puzzles.values()].map((r) => structuredClone(r))),
    getPuzzle: async (id) => structuredClone(puzzles.get(id) ?? null),
    putPuzzle: async (record) => void puzzles.set(record.id, structuredClone(record)),
    deletePuzzle: async (id) => void puzzles.delete(id),
    listProgress: async () => [...progress.values()].map((r) => structuredClone(r)),
    putProgress: async (record) => void progress.set(record.key, structuredClone(record)),
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

function isProgressRecord(value: unknown): value is ProgressRecord {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return typeof r.key === "string" && typeof r.solved === "boolean" && Number.isInteger(r.bestMoves);
}

/** Random id for a new library entry (fits the router's local id pattern). */
export function newPuzzleId(): string {
  return crypto.randomUUID();
}

/** A copy of a puzzle under a new id. */
export function copyRecord(record: PuzzleRecord, id: string, title: string, now: string): PuzzleRecord {
  return { id, doc: { ...record.doc, meta: { ...record.doc.meta, title, createdAt: now } }, updatedAt: now };
}

/**
 * Identifies a puzzle by its content, so progress is shared between an example,
 * a share link and a library copy of the same puzzle. Edits lead to a new key.
 */
export function progressKey(doc: PuzzleDocument): Promise<string> {
  return sha256Hex(JSON.stringify([doc.type, doc.typeVersion, doc.data]));
}

/** Progress after solving with `moves` moves; keeps the best result. */
export function recordSolve(previous: ProgressRecord | undefined, key: string, moves: number): ProgressRecord {
  const bestMoves = previous?.solved ? Math.min(previous.bestMoves, moves) : moves;
  return { key, solved: true, bestMoves };
}
