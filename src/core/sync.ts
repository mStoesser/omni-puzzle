// Synchronizing the library and progress with the account (M27). Pure apart from the injected api and storage.
//
// Each entry is merged on its own: for puzzles the newer change wins (`updatedAt`, set by the device that
// changed it), deletions are kept as tombstones; for progress "solved anywhere" and the best values count.
// A sync first pulls everything changed on the server since the cursor (a change number per account, assigned
// by the server, so wrong device clocks cannot skip changes), then pushes the local changes.
import type { Api } from "./api.ts";
import type { ImageType } from "./images.ts";
import type { ProgressRecord, PuzzleRecord, Storage } from "./storage.ts";
import type { PuzzleDocument } from "./types.ts";

/** Server limits, also checked by sync_push() in 0012_sync.sql. */
export const SYNC = {
  maxPuzzles: 500, // per account, without deleted ones
  maxDocBytes: 65_536, // per document (JSON)
  maxProgress: 5_000,
  maxImages: 100, // per account in user-images
  pullPage: 100,
  pushPuzzles: 50,
  pushProgress: 500,
} as const;

const PUZZLE_ID = /^[A-Za-z0-9_-]{1,64}$/; // the router's local id
const PROGRESS_KEY = /^[0-9a-f]{64}$/;
const MAX_TIME_MS = 2_147_483_647; // integer column

/** A deleted library entry; kept until the deletion reached the server. */
export type Tombstone = { id: string; deletedAt: string };

/** "Changed since the last sync": `p:<puzzle id>` or `g:<progress key>`; `stamp` tells later changes apart. */
export type DirtyEntry = { key: string; stamp: string };

/** Per account on this device. `uploaded`: image keys already in user-images. */
export type SyncMeta = { cursor: number; lastSync: string | null; uploaded: string[] };

export type RemotePuzzle = { kind: "puzzle"; id: string; doc: PuzzleDocument | null; updatedAt: string; deleted: boolean; rev: number };
export type RemoteProgress = { kind: "progress"; record: ProgressRecord; rev: number };
export type RemoteRow = RemotePuzzle | RemoteProgress;

export const puzzleDirtyKey = (id: string) => `p:${id}`;
export const progressDirtyKey = (key: string) => `g:${key}`;

export function progressStamp(record: ProgressRecord): string {
  return JSON.stringify([record.solved, record.bestMoves, record.bestTimeMs ?? null]);
}

const time = (iso: string) => Date.parse(iso);

/**
 * What a pulled puzzle does to the local entry. The newer change wins; on a tie the local one stays (it is the same
 * change coming back). `dirty`: the local state differs from the server, so it is pushed again.
 */
export function resolvePuzzle(
  local: PuzzleRecord | null,
  tombstone: Tombstone | null,
  remote: RemotePuzzle,
): { action: "keep"; dirty: boolean } | { action: "put"; record: PuzzleRecord } | { action: "delete"; tombstone: Tombstone } {
  const localTime = local ? time(local.updatedAt) : tombstone ? time(tombstone.deletedAt) : -Infinity;
  const remoteTime = time(remote.updatedAt);
  if (remoteTime <= localTime) return { action: "keep", dirty: remoteTime < localTime };
  const updatedAt = new Date(remoteTime).toISOString();
  if (remote.deleted || !remote.doc) return { action: "delete", tombstone: { id: remote.id, deletedAt: updatedAt } };
  return { action: "put", record: { id: remote.id, doc: remote.doc, updatedAt } };
}

/** Solved anywhere counts; the best moves and, independently, the best time. */
export function mergeProgress(a: ProgressRecord | undefined, b: ProgressRecord): ProgressRecord {
  if (!a || !a.solved) return b.solved || !a ? b : a;
  if (!b.solved) return a;
  const record: ProgressRecord = { key: b.key, solved: true, bestMoves: Math.min(a.bestMoves, b.bestMoves) };
  const times = [a.bestTimeMs, b.bestTimeMs].filter((t) => t !== undefined);
  if (times.length > 0) record.bestTimeMs = Math.min(...times);
  return record;
}

export function sameProgress(a: ProgressRecord, b: ProgressRecord): boolean {
  return a.key === b.key && progressStamp(a) === progressStamp(b);
}

// --- What the server sends ---

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Checks one row of sync_pull(). Documents must pass `accept` (loadDocument as a draft, in main.ts);
 * rejected or malformed rows are skipped, their change number still moves the cursor.
 */
export function parseRemoteRow(raw: unknown, accept: (doc: unknown) => boolean): RemoteRow | null {
  if (!isRecord(raw) || !Number.isSafeInteger(raw.rev)) return null;
  const rev = raw.rev as number;
  if (raw.kind === "puzzle") {
    if (typeof raw.id !== "string" || !PUZZLE_ID.test(raw.id) || typeof raw.updated_at !== "string") return null;
    if (Number.isNaN(time(raw.updated_at)) || typeof raw.deleted !== "boolean") return null;
    if (raw.deleted) return { kind: "puzzle", id: raw.id, doc: null, updatedAt: raw.updated_at, deleted: true, rev };
    if (!isRecord(raw.doc) || !accept(raw.doc)) return null;
    return { kind: "puzzle", id: raw.id, doc: raw.doc as PuzzleDocument, updatedAt: raw.updated_at, deleted: false, rev };
  }
  if (raw.kind === "progress") {
    const { id: key, solved, best_moves: moves, best_time_ms: ms } = raw;
    if (typeof key !== "string" || !PROGRESS_KEY.test(key) || solved !== true) return null;
    if (!Number.isInteger(moves) || (moves as number) < 0) return null;
    if (ms !== null && ms !== undefined && (!Number.isInteger(ms) || (ms as number) < 0)) return null;
    const record: ProgressRecord = { key, solved: true, bestMoves: moves as number };
    if (typeof ms === "number") record.bestTimeMs = ms;
    return { kind: "progress", record, rev };
  }
  return null;
}

// --- Talking to the server ---

export type PushPuzzle = { id: string; doc: PuzzleDocument | null; updated_at: string; deleted: boolean };
export type PushProgress = { key: string; solved: true; best_moves: number; best_time_ms: number | null };
export type PushResult = { cursor: number; rejected: { id: string; reason: "limit" | "too-large" }[] };

export type SyncApi = {
  pull(after: number, limit: number): Promise<unknown[]>;
  push(known: number, puzzles: PushPuzzle[], progress: PushProgress[]): Promise<PushResult>;
  uploadImage(userId: string, key: string, type: ImageType, bytes: Uint8Array): Promise<void>;
  downloadImage(userId: string, key: string): Promise<Uint8Array>;
};

/** Path of a synced picture in the private bucket. */
export function userImagePath(userId: string, key: string) {
  return `user-images/${userId}/${key}`;
}

export function createSyncApi(api: Api): SyncApi {
  return {
    pull: (after, limit) => api.rest<unknown[]>("rpc/sync_pull", { body: { after_rev: after, max_rows: limit } }),
    push: async (known, puzzles, progress) => {
      const result = await api.rest<unknown>("rpc/sync_push", { body: { known, puzzles, progress } });
      if (!isRecord(result) || !Number.isSafeInteger(result.cursor) || !Array.isArray(result.rejected)) {
        throw new Error("unexpected sync_push result");
      }
      return result as PushResult;
    },
    uploadImage: async (userId, key, type, bytes) => {
      // Same key = same bytes, so overwriting is harmless and saves a "duplicate" error.
      await api.storage(`object/${userImagePath(userId, key)}`, { method: "POST", bytes, contentType: type, headers: { "x-upsert": "true" } });
    },
    downloadImage: async (userId, key) => (await api.storage(`object/authenticated/${userImagePath(userId, key)}`)) ?? new Uint8Array(),
  };
}

// --- One sync run ---

export type SyncDeps = {
  api: SyncApi;
  storage: Storage;
  userId: string;
  /** loadDocument(doc, registry, { draft: true }) passes, or the document needs a newer app version. */
  accept(doc: unknown): boolean;
  /** Picture keys a document uses (the type's imageKeys); [] for broken documents. */
  imageKeys(doc: PuzzleDocument): string[];
  now(): string;
};

export type SyncOutcome = {
  changed: boolean; // something from the server changed local data
  rejected: number; // puzzles the server did not take (limits)
};

const emptyMeta = (): SyncMeta => ({ cursor: 0, lastSync: null, uploaded: [] });

export async function readSyncMeta(storage: Storage, userId: string): Promise<SyncMeta> {
  const raw = await storage.getMeta(`sync:${userId}`);
  if (!isRecord(raw) || !Number.isSafeInteger(raw.cursor) || !Array.isArray(raw.uploaded)) return emptyMeta();
  return {
    cursor: raw.cursor as number,
    lastSync: typeof raw.lastSync === "string" ? raw.lastSync : null,
    uploaded: raw.uploaded.filter((k): k is string => typeof k === "string"),
  };
}

export async function syncOnce(deps: SyncDeps): Promise<SyncOutcome> {
  const { api, storage, userId } = deps;
  const meta = await readSyncMeta(storage, userId);
  const saveMeta = () => storage.putMeta(`sync:${userId}`, meta);
  let changed = false;

  // 1. Pull everything since the cursor, page by page.
  for (;;) {
    const rows = await api.pull(meta.cursor, SYNC.pullPage);
    if (rows.length === 0) break;
    let cursor = meta.cursor;
    const remote: RemoteRow[] = [];
    for (const raw of rows) {
      if (isRecord(raw) && Number.isSafeInteger(raw.rev)) cursor = Math.max(cursor, raw.rev as number);
      const row = parseRemoteRow(raw, deps.accept);
      if (row) remote.push(row);
    }
    if (cursor === meta.cursor) break; // nothing usable: do not loop forever
    if ((await storage.applyRemote(remote)).changed) changed = true;
    meta.cursor = cursor;
    await saveMeta();
    if (rows.length < SYNC.pullPage) break;
  }

  // 2. Push local changes in batches.
  let rejected = 0;
  const uploaded = new Set(meta.uploaded);
  const dirty = await storage.listDirty();
  const puzzleEntries = dirty.filter((e) => e.key.startsWith("p:"));
  const progressEntries = dirty.filter((e) => e.key.startsWith("g:"));
  const tombstones = new Map((await storage.listTombstones()).map((t) => [t.id, t]));
  const progress = new Map((await storage.listProgress()).map((r) => [r.key, r]));

  let pi = 0;
  let gi = 0;
  while (pi < puzzleEntries.length || gi < progressEntries.length) {
    const sent: DirtyEntry[] = [];
    const puzzles: PushPuzzle[] = [];
    for (const entry of puzzleEntries.slice(pi, pi + SYNC.pushPuzzles)) {
      const id = entry.key.slice(2);
      const record = await storage.getPuzzle(id);
      if (record) {
        if (!(await uploadImages(deps, record.doc, uploaded))) {
          rejected++; // stays marked, retried next time
          continue;
        }
        puzzles.push({ id, doc: record.doc, updated_at: record.updatedAt, deleted: false });
      } else {
        const tombstone = tombstones.get(id);
        if (tombstone) puzzles.push({ id, doc: null, updated_at: tombstone.deletedAt, deleted: true });
      }
      sent.push(entry);
    }
    pi += SYNC.pushPuzzles;
    const progressBatch: PushProgress[] = [];
    for (const entry of progressEntries.slice(gi, gi + SYNC.pushProgress)) {
      const record = progress.get(entry.key.slice(2));
      if (record?.solved && PROGRESS_KEY.test(record.key)) {
        const ms = record.bestTimeMs;
        progressBatch.push({
          key: record.key,
          solved: true,
          best_moves: record.bestMoves,
          best_time_ms: ms !== undefined && Number.isInteger(ms) && ms <= MAX_TIME_MS ? ms : null,
        });
      }
      sent.push(entry);
    }
    gi += SYNC.pushProgress;
    if (puzzles.length === 0 && progressBatch.length === 0) {
      await storage.clearDirty(sent);
      continue;
    }
    puzzles.sort((x, y) => Number(y.deleted) - Number(x.deleted)); // deletions first: they free room under the limit
    const result = await api.push(meta.cursor, puzzles, progressBatch);
    const refused = new Set(result.rejected.map((r) => puzzleDirtyKey(r.id)));
    rejected += refused.size;
    await storage.clearDirty(sent.filter((e) => !refused.has(e.key)));
    meta.cursor = result.cursor;
    meta.uploaded = [...uploaded];
    await saveMeta();
  }

  meta.uploaded = [...uploaded];
  meta.lastSync = deps.now();
  await saveMeta();
  return { changed, rejected };
}

/** Uploads the document's pictures that are not on the server yet; false if one failed (the puzzle waits). */
async function uploadImages(deps: SyncDeps, doc: PuzzleDocument, uploaded: Set<string>): Promise<boolean> {
  for (const key of deps.imageKeys(doc)) {
    if (uploaded.has(key)) continue;
    const image = await deps.storage.getImage(key);
    if (!image) continue; // lost locally: the other devices show the alternative text
    try {
      await deps.api.uploadImage(deps.userId, key, image.type, image.bytes);
      uploaded.add(key);
    } catch (error) {
      console.warn("image upload", error);
      return false;
    }
  }
  return true;
}

// --- Which local data belongs to which account ---

/**
 * What happens when `userId` signs in on a device whose data last synced with `owner`:
 * - "sync": same account (or nothing local to worry about) → just sync
 * - "adopt": the device never synced → its data goes into the account
 * - "ask": another account's data is on the device → the user decides (take over or remove from the device)
 */
export function ownerDecision(owner: string | null, userId: string, hasLocalData: boolean): "sync" | "adopt" | "ask" {
  if (owner === userId) return "sync";
  if (owner === null) return "adopt";
  return hasLocalData ? "ask" : "adopt";
}
