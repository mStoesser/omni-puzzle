// Synchronizing the library and progress with the account (M27). Pure apart from the injected api and storage.
//
// Each entry is merged on its own: for puzzles the newer change wins (`updatedAt`, set by the device that
// changed it), deletions are kept as tombstones; for progress "solved anywhere" and the best values count.
// M48: own escape rooms like puzzles (the room is only checked when opened, so the room logic is not needed here),
// and the saved games in rooms (mergeRoomSave: what was reached anywhere counts, a restart starts anew).
// A sync first pulls everything changed on the server since the cursor (a change number per account, assigned
// by the server, so wrong device clocks cannot skip changes), then pushes the local changes.
import type { Api } from "./api.ts";
import type { ImageType } from "./images.ts";
import type { ProgressRecord, PuzzleRecord, RoomRecord, Storage } from "./storage.ts";
import type { PuzzleDocument } from "./types.ts";

/** Server limits, also checked by sync_push() in 0012_sync.sql and 0018_sync_rooms.sql. */
export const SYNC = {
  maxPuzzles: 500, // per account, without deleted ones
  maxDocBytes: 65_536, // per document (JSON)
  maxProgress: 5_000,
  maxImages: 400, // per account in user-images (M48: was 100; rooms bring up to 20)
  maxRooms: 20, // M48, without deleted ones
  maxRoomBytes: 524_288, // ROOM_LIMITS.maxDocBytes
  maxSaves: 500,
  maxSaveBytes: 16_384,
  pullPage: 100,
  pullRooms: 4, // rooms per pull at most (up to 2 MB); the rest of that page waits for the next call
  pushPuzzles: 50,
  pushProgress: 500,
  pushRooms: 2,
  pushSaves: 100,
} as const;

/** Version of SyncMeta: older apps skipped rooms while moving the cursor, so a meta without it pulls everything again. */
const META_VERSION = 2;

const PUZZLE_ID = /^[A-Za-z0-9_-]{1,64}$/; // the router's local id
const PROGRESS_KEY = /^[0-9a-f]{64}$/;
const MAX_TIME_MS = 2_147_483_647; // integer column

/** A deleted library entry; kept until the deletion reached the server. */
export type Tombstone = { id: string; deletedAt: string };

/**
 * "Changed since the last sync": `p:<puzzle id>`, `g:<progress key>`, `r:<room id>` (M48) or `s:<room content key>`
 * (a saved game, M48); `stamp` tells later changes apart. A room's tombstone has the id `r:<room id>`.
 */
export type DirtyEntry = { key: string; stamp: string };

/** Per account on this device. `uploaded`: image keys already in user-images. */
export type SyncMeta = { cursor: number; lastSync: string | null; uploaded: string[]; version?: number };

export type RemotePuzzle = { kind: "puzzle"; id: string; doc: PuzzleDocument | null; updatedAt: string; deleted: boolean; rev: number };
export type RemoteProgress = { kind: "progress"; record: ProgressRecord; rev: number };
export type RemoteRoom = { kind: "room"; id: string; doc: RoomRecord["doc"] | null; updatedAt: string; deleted: boolean; rev: number };
export type RemoteRoomSave = { kind: "room-save"; key: string; save: RoomSaveShape; rev: number };
export type RemoteRow = RemotePuzzle | RemoteProgress | RemoteRoom | RemoteRoomSave;

export const puzzleDirtyKey = (id: string) => `p:${id}`;
export const progressDirtyKey = (key: string) => `g:${key}`;
export const roomDirtyKey = (id: string) => `r:${id}`;
export const roomSaveDirtyKey = (key: string) => `s:${key}`;

export function progressStamp(record: ProgressRecord): string {
  return JSON.stringify([record.solved, record.bestMoves, record.bestTimeMs ?? null]);
}

const time = (iso: string) => Date.parse(iso);

export type Resolution<R> = { action: "keep"; dirty: boolean } | { action: "put"; record: R } | { action: "delete"; tombstone: Tombstone };

/**
 * What a pulled puzzle (or room) does to the local entry. The newer change wins; on a tie the local one stays (it is
 * the same change coming back). `dirty`: the local state differs from the server, so it is pushed again.
 */
function resolveNewer<D>(
  local: { updatedAt: string } | null,
  tombstone: Tombstone | null,
  remote: { id: string; doc: D | null; updatedAt: string; deleted: boolean },
): Resolution<{ id: string; doc: D; updatedAt: string }> {
  const localTime = local ? time(local.updatedAt) : tombstone ? time(tombstone.deletedAt) : -Infinity;
  const remoteTime = time(remote.updatedAt);
  if (remoteTime <= localTime) return { action: "keep", dirty: remoteTime < localTime };
  const updatedAt = new Date(remoteTime).toISOString();
  if (remote.deleted || !remote.doc) return { action: "delete", tombstone: { id: remote.id, deletedAt: updatedAt } };
  return { action: "put", record: { id: remote.id, doc: remote.doc, updatedAt } };
}

export function resolvePuzzle(local: PuzzleRecord | null, tombstone: Tombstone | null, remote: RemotePuzzle): Resolution<PuzzleRecord> {
  return resolveNewer(local, tombstone, remote);
}

/** Rooms (M48) follow the same rule; the tombstone is that of `r:<id>`. */
export function resolveRoom(local: RoomRecord | null, tombstone: Tombstone | null, remote: RemoteRoom): Resolution<RoomRecord> {
  const result = resolveNewer(local, tombstone, remote);
  return result.action === "delete" ? { action: "delete", tombstone: { ...result.tombstone, id: roomDirtyKey(remote.id) } } : result;
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

// --- Saved games in escape rooms (M48) ---

/**
 * The saved game of a room (RoomSave in rooms/save.ts) as far as it can be checked without the room: the room checks
 * it again when it is opened (parseRoomSave). `resetAt`: when "restart" was chosen last (missing: never).
 */
export type RoomSaveShape = {
  progress: { scene: string; shared: { flags: readonly string[]; solved: readonly string[]; opened: readonly string[]; won: boolean } };
  hints: Readonly<Record<string, number>>;
  introSeen: boolean;
  startedAt: number;
  wonAfterMs: number | null;
  resetAt?: number;
};

const ROOM_SAVE_KEY = /^[0-9a-f]{64}$/;

const isStringList = (value: unknown): value is string[] => Array.isArray(value) && value.every((x) => typeof x === "string");
const isTime = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;

export function isRoomSaveShape(value: unknown): value is RoomSaveShape {
  if (!isRecord(value) || !isRecord(value.progress) || !isRecord(value.progress.shared) || !isRecord(value.hints)) return false;
  const { scene, shared } = value.progress;
  if (typeof scene !== "string" || !isStringList(shared.flags) || !isStringList(shared.solved) || !isStringList(shared.opened)) return false;
  if (typeof shared.won !== "boolean" || typeof value.introSeen !== "boolean" || !isTime(value.startedAt)) return false;
  if (value.wonAfterMs !== null && !isTime(value.wonAfterMs)) return false;
  if (value.resetAt !== undefined && !isTime(value.resetAt)) return false;
  return Object.values(value.hints).every((n) => Number.isInteger(n) && (n as number) >= 0);
}

/** What is compared and pushed: everything but the scene, which stays on each device (like in a round, M47). */
export function roomSaveStamp(save: RoomSaveShape): string {
  const { shared } = save.progress;
  const hints = Object.keys(save.hints).sort().map((k) => [k, save.hints[k]]);
  return JSON.stringify([shared.flags, shared.solved, shared.opened, shared.won, hints, save.introSeen, save.startedAt, save.wonAfterMs, save.resetAt ?? 0]);
}

const union = (a: readonly string[], b: readonly string[]) => [...new Set([...a, ...b])].sort();

/**
 * Two saved games of the same room. A later restart wins as a whole (the other game is from before it). Otherwise what
 * was reached anywhere counts, like in a round: switches, puzzles, locks, victory, shown hints, the seen intro; the
 * clock runs from the earliest start, a victory counts at its earliest moment. The local scene stays.
 */
export function mergeRoomSave(local: RoomSaveShape | null, remote: RoomSaveShape): RoomSaveShape {
  if (!local) return remote;
  const localReset = local.resetAt ?? 0;
  const remoteReset = remote.resetAt ?? 0;
  if (localReset !== remoteReset) return localReset > remoteReset ? local : remote;
  const a = local.progress.shared;
  const b = remote.progress.shared;
  const hints: Record<string, number> = { ...local.hints };
  for (const [scene, n] of Object.entries(remote.hints)) hints[scene] = Math.max(hints[scene] ?? 0, n);
  const startedAt = Math.min(local.startedAt, remote.startedAt);
  const wins = [local, remote].flatMap((s) => (s.wonAfterMs === null ? [] : [s.startedAt + s.wonAfterMs]));
  const won = a.won || b.won;
  const merged: RoomSaveShape = {
    progress: {
      scene: local.progress.scene,
      shared: { flags: union(a.flags, b.flags), solved: union(a.solved, b.solved), opened: union(a.opened, b.opened), won },
    },
    hints,
    introSeen: local.introSeen || remote.introSeen,
    startedAt,
    wonAfterMs: won && wins.length > 0 ? Math.max(0, Math.min(...wins) - startedAt) : null,
  };
  if (localReset > 0) merged.resetAt = localReset;
  return merged;
}

// --- What the server sends ---

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Checks one row of sync_pull(). Documents must pass `accept` (loadDocument as a draft, in main.ts); rooms only need
 * to be one (they are checked when opened). Rejected or malformed rows are skipped, their change number still moves
 * the cursor.
 */
export function parseRemoteRow(raw: unknown, accept: (doc: unknown) => boolean): RemoteRow | null {
  if (!isRecord(raw) || !Number.isSafeInteger(raw.rev)) return null;
  const rev = raw.rev as number;
  if (raw.kind === "puzzle" || raw.kind === "room") {
    if (typeof raw.id !== "string" || !PUZZLE_ID.test(raw.id) || typeof raw.updated_at !== "string") return null;
    if (Number.isNaN(time(raw.updated_at)) || typeof raw.deleted !== "boolean") return null;
    const base = { id: raw.id, updatedAt: raw.updated_at, rev };
    if (raw.kind === "room") {
      if (raw.deleted) return { kind: "room", ...base, doc: null, deleted: true };
      if (!isRecord(raw.doc) || raw.doc.kind !== "escape-room") return null;
      return { kind: "room", ...base, doc: raw.doc as RoomRecord["doc"], deleted: false };
    }
    if (raw.deleted) return { kind: "puzzle", ...base, doc: null, deleted: true };
    if (!isRecord(raw.doc) || !accept(raw.doc)) return null;
    return { kind: "puzzle", ...base, doc: raw.doc as PuzzleDocument, deleted: false };
  }
  if (raw.kind === "room-save") {
    if (typeof raw.id !== "string" || !ROOM_SAVE_KEY.test(raw.id) || !isRoomSaveShape(raw.doc)) return null;
    return { kind: "room-save", key: raw.id, save: raw.doc, rev };
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
export type PushRoom = { id: string; doc: RoomRecord["doc"] | null; updated_at: string; deleted: boolean };
export type PushSave = { key: string; save: RoomSaveShape };
/** Rejected rooms carry `kind: "room"`, puzzles nothing. */
export type PushResult = { cursor: number; rejected: { id: string; reason: "limit" | "too-large"; kind?: "room" }[] };
export type PushBatch = { puzzles: PushPuzzle[]; progress: PushProgress[]; rooms: PushRoom[]; saves: PushSave[] };

export type SyncApi = {
  pull(after: number, limit: number): Promise<unknown[]>;
  push(known: number, batch: PushBatch): Promise<PushResult>;
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
    push: async (known, { puzzles, progress, rooms, saves }) => {
      // Rooms and saves only when there are some: without them the call also works before 0018_sync_rooms.sql.
      const body: Record<string, unknown> = { known, puzzles, progress };
      if (rooms.length > 0) body.rooms = rooms;
      if (saves.length > 0) body.saves = saves;
      const result = await api.rest<unknown>("rpc/sync_push", { body });
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
  /** The same for a room (M48; needs the room logic, loaded on demand); [] if broken, null if unavailable now. */
  roomImageKeys(doc: RoomRecord["doc"]): Promise<string[] | null>;
  now(): string;
};

export type SyncOutcome = {
  changed: boolean; // something from the server changed local data
  rejected: number; // puzzles the server did not take (limits)
  rejectedRooms: number; // the same for escape rooms (M48)
};

const emptyMeta = (): SyncMeta => ({ cursor: 0, lastSync: null, uploaded: [], version: META_VERSION });

export async function readSyncMeta(storage: Storage, userId: string): Promise<SyncMeta> {
  const raw = await storage.getMeta(`sync:${userId}`);
  if (!isRecord(raw) || !Number.isSafeInteger(raw.cursor) || !Array.isArray(raw.uploaded)) return emptyMeta();
  return {
    cursor: raw.version === META_VERSION ? (raw.cursor as number) : 0,
    lastSync: typeof raw.lastSync === "string" ? raw.lastSync : null,
    uploaded: raw.uploaded.filter((k): k is string => typeof k === "string"),
    version: META_VERSION,
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
    let rooms = 0;
    const remote: RemoteRow[] = [];
    for (const raw of rows) {
      if (isRecord(raw) && Number.isSafeInteger(raw.rev)) cursor = Math.max(cursor, raw.rev as number);
      if (isRecord(raw) && raw.kind === "room") rooms++;
      const row = parseRemoteRow(raw, deps.accept);
      if (row) remote.push(row);
    }
    if (cursor === meta.cursor) break; // nothing usable: do not loop forever
    if ((await storage.applyRemote(remote)).changed) changed = true;
    meta.cursor = cursor;
    await saveMeta();
    // A page with as many rooms as allowed may end early (see sync_pull in 0018_sync_rooms.sql).
    if (rows.length < SYNC.pullPage && rooms < SYNC.pullRooms) break;
  }

  // 2. Push local changes in batches.
  let rejected = 0;
  let rejectedRooms = 0;
  const uploaded = new Set(meta.uploaded);
  const dirty = await storage.listDirty();
  const of = (prefix: string) => dirty.filter((e) => e.key.startsWith(prefix));
  const queues = { puzzles: of("p:"), progress: of("g:"), rooms: of("r:"), saves: of("s:") };
  const tombstones = new Map((await storage.listTombstones()).map((t) => [t.id, t]));
  const progress = new Map((await storage.listProgress()).map((r) => [r.key, r]));

  while (queues.puzzles.length + queues.progress.length + queues.rooms.length + queues.saves.length > 0) {
    const sent: DirtyEntry[] = [];
    const batch: PushBatch = { puzzles: [], progress: [], rooms: [], saves: [] };
    for (const entry of queues.puzzles.splice(0, SYNC.pushPuzzles)) {
      const id = entry.key.slice(2);
      const record = await storage.getPuzzle(id);
      if (record) {
        if (!(await uploadImages(deps, deps.imageKeys(record.doc), uploaded))) {
          rejected++; // stays marked, retried next time
          continue;
        }
        batch.puzzles.push({ id, doc: record.doc, updated_at: record.updatedAt, deleted: false });
      } else {
        const tombstone = tombstones.get(id);
        if (tombstone) batch.puzzles.push({ id, doc: null, updated_at: tombstone.deletedAt, deleted: true });
      }
      sent.push(entry);
    }
    for (const entry of queues.progress.splice(0, SYNC.pushProgress)) {
      const record = progress.get(entry.key.slice(2));
      if (record?.solved && PROGRESS_KEY.test(record.key)) {
        const ms = record.bestTimeMs;
        batch.progress.push({
          key: record.key,
          solved: true,
          best_moves: record.bestMoves,
          best_time_ms: ms !== undefined && Number.isInteger(ms) && ms <= MAX_TIME_MS ? ms : null,
        });
      }
      sent.push(entry);
    }
    for (const entry of queues.rooms.splice(0, SYNC.pushRooms)) {
      const id = entry.key.slice(2);
      const record = await storage.getRoom(id);
      if (record) {
        const keys = await deps.roomImageKeys(record.doc);
        if (keys === null) continue; // the room logic is not available now (offline): next time
        if (!(await uploadImages(deps, keys, uploaded))) {
          rejectedRooms++;
          continue;
        }
        batch.rooms.push({ id, doc: record.doc, updated_at: record.updatedAt, deleted: false });
      } else {
        const tombstone = tombstones.get(entry.key);
        if (tombstone) batch.rooms.push({ id, doc: null, updated_at: tombstone.deletedAt, deleted: true });
      }
      sent.push(entry);
    }
    for (const entry of queues.saves.splice(0, SYNC.pushSaves)) {
      const key = entry.key.slice(2);
      const save = await storage.getRoomSave(key);
      // Too large for the server (many hints in a big room): it stays on this device.
      if (save && ROOM_SAVE_KEY.test(key) && JSON.stringify(save).length <= SYNC.maxSaveBytes) batch.saves.push({ key, save });
      sent.push(entry);
    }
    if (batch.puzzles.length + batch.progress.length + batch.rooms.length + batch.saves.length === 0) {
      await storage.clearDirty(sent);
      continue;
    }
    // Deletions first: they free room under the limit.
    batch.puzzles.sort((x, y) => Number(y.deleted) - Number(x.deleted));
    batch.rooms.sort((x, y) => Number(y.deleted) - Number(x.deleted));
    const result = await api.push(meta.cursor, batch);
    const refused = new Set(result.rejected.map((r) => (r.kind === "room" ? roomDirtyKey(r.id) : puzzleDirtyKey(r.id))));
    for (const r of result.rejected) {
      if (r.kind === "room") rejectedRooms++;
      else rejected++;
    }
    await storage.clearDirty(sent.filter((e) => !refused.has(e.key)));
    meta.cursor = result.cursor;
    meta.uploaded = [...uploaded];
    await saveMeta();
  }

  meta.uploaded = [...uploaded];
  meta.lastSync = deps.now();
  await saveMeta();
  return { changed, rejected, rejectedRooms };
}

/** Uploads the pictures that are not on the server yet; false if one failed (the puzzle or room waits). */
async function uploadImages(deps: SyncDeps, keys: readonly string[], uploaded: Set<string>): Promise<boolean> {
  for (const key of keys) {
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
