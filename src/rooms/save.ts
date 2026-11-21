// Escape rooms (M44): the saved game on this device (IndexedDB, meta store). Pure: building, checking and keying.

import { sha256Hex } from "../core/hash.ts";
import { startProgress } from "./logic.ts";
import type { EscapeRoomData, EscapeRoomDocument, Progress, Shared } from "./logic.ts";

export type RoomSave = {
  progress: Progress;
  hints: Readonly<Record<string, number>>; // scene id → how many hints were shown
  introSeen: boolean;
  startedAt: number; // ms since 1970; the room clock is wall time, like in a real escape room
  wonAfterMs: number | null;
  /** When "restart" was chosen last (M48): a later restart on another device wins over this game when syncing. */
  resetAt?: number;
};

/** The meta-store key of a room's saved game: the same room (by content) continues, a changed one starts anew. */
export function roomSaveKey(doc: EscapeRoomDocument): string {
  return `room:${sha256Hex(JSON.stringify([doc.version, doc.data]))}`;
}

/** The room's content key without prefix: stored with a published room and kept for "shared by link" (M46). */
export function roomContentKey(doc: EscapeRoomDocument): string {
  return roomSaveKey(doc).slice("room:".length);
}

export function newRoomSave(data: EscapeRoomData, now: number): RoomSave {
  return { progress: startProgress(data), hints: {}, introSeen: data.intro === undefined, startedAt: now, wonAfterMs: null };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ids(value: unknown, known: ReadonlySet<string>): string[] | null {
  if (!Array.isArray(value) || !value.every((x) => typeof x === "string" && known.has(x))) return null;
  return [...new Set(value as string[])].sort();
}

/** A saved game read back, checked against the room; null if it does not fit (then the room starts anew). */
export function parseRoomSave(raw: unknown, data: EscapeRoomData): RoomSave | null {
  if (!isRecord(raw) || !isRecord(raw.progress) || !isRecord(raw.progress.shared) || !isRecord(raw.hints)) return null;
  const scene = raw.progress.scene;
  if (typeof scene !== "string" || !data.scenes.some((s) => s.id === scene)) return null;
  const s = raw.progress.shared;
  const flags = ids(s.flags, new Set(data.flags.map((f) => f.id)));
  const solved = ids(s.solved, new Set(data.puzzles.map((p) => p.id)));
  const opened = ids(s.opened, new Set(data.locks.map((l) => l.id)));
  if (!flags || !solved || !opened || typeof s.won !== "boolean") return null;
  const shared: Shared = { flags, solved, opened, won: s.won };
  const hints: Record<string, number> = {};
  for (const scene of data.scenes) {
    const n = raw.hints[scene.id];
    if (Number.isInteger(n) && (n as number) > 0) hints[scene.id] = Math.min(n as number, scene.hints.length);
  }
  const { startedAt, wonAfterMs, introSeen } = raw;
  if (typeof startedAt !== "number" || !Number.isFinite(startedAt) || typeof introSeen !== "boolean") return null;
  if (wonAfterMs !== null && (typeof wonAfterMs !== "number" || wonAfterMs < 0)) return null;
  if (shared.won !== (wonAfterMs !== null)) return null;
  const save: RoomSave = { progress: { scene, shared }, hints, introSeen, startedAt, wonAfterMs };
  if (typeof raw.resetAt === "number" && Number.isFinite(raw.resetAt) && raw.resetAt >= 0) save.resetAt = raw.resetAt;
  return save;
}

/** Whether anything happened yet (for "continue" on the home page). */
export function roomStarted(save: RoomSave, data: EscapeRoomData): boolean {
  const { shared, scene } = save.progress;
  return scene !== data.start || shared.flags.length + shared.solved.length + shared.opened.length > 0 || shared.won;
}
