// Escape rooms (M47): playing together, each on their own phone. Pure and DOM-free; shared by the app and the Edge
// Function "round" (src/server/round-handler.ts).
//
// A round belongs to a published room. Everyone solves on their own device; only what is solved is shared (`Shared`:
// switches, solved puzzles, open locks, victory). It only grows, so the round's state is the union of everything the
// players reported. Players send the events that changed it, with the scene they stood in; the server replays them
// on its own state and the room's document and keeps what holds. Where someone stands stays on their device.
import { applyEvent, mergeShared } from "./logic.ts";
import type { EscapeRoomData, RoomEvent, Shared } from "./logic.ts";

export const GROUP = {
  maxPlayers: 8,
  perDay: 10, // rounds one account may start per day; enforced by round_create() in supabase/migrations/0017_rounds.sql
  maxEvents: 20, // per request
  maxRoundEvents: 1000, // per round, against abuse
  roundHours: 24, // joining and playing; the daily cleanup deletes rounds after two days
  nameMax: 24,
  pollMs: 3000,
  activeMs: 30_000, // a player counts as present when seen this recently
  maxRequestBytes: 16_384,
} as const;

/** 32 characters without 0/O and 1/I, so a code can be read out and typed. */
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;
const CODE = /^[A-HJ-NP-Z2-9]{6}$/;
const TOKEN = /^[0-9a-f]{64}$/;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** What someone typed: upper case, without spaces and dashes. */
export function normalizeRoundCode(input: string): string {
  return input.replace(/[\s-]+/g, "").toUpperCase();
}

export function isRoundCode(code: unknown): code is string {
  return typeof code === "string" && CODE.test(code);
}

export function isPlayerToken(token: unknown): token is string {
  return typeof token === "string" && TOKEN.test(token);
}

/** `random(n)`: n random bytes (crypto.getRandomValues). 256 is a multiple of 32, so every character is equally likely. */
export function newRoundCode(random: (n: number) => Uint8Array): string {
  return [...random(CODE_LENGTH)].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

/** The secret that lets one player into a round; the server keeps only its SHA-256. */
export function newPlayerToken(random: (n: number) => Uint8Array): string {
  return [...random(32)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** A player's name as shown to the others: trimmed, single spaces, no control characters; null if empty or too long. */
export function cleanPlayerName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/[\p{Cc}\p{Cf}]/gu, "").replace(/\s+/g, " ").trim();
  return name.length >= 1 && [...name].length <= GROUP.nameMax ? name : null;
}

/** One event of a player, with the scene they stood in (tap areas belong to a scene). */
export type GroupEvent = { scene: string; event: RoomEvent };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const id = (value: unknown): value is string => typeof value === "string" && ID.test(value);

function parseEvent(raw: unknown): RoomEvent | null {
  if (!isRecord(raw)) return null;
  if (raw.kind === "spot" && id(raw.spot)) return { kind: "spot", spot: raw.spot };
  if (raw.kind === "solved" && id(raw.puzzle)) return { kind: "solved", puzzle: raw.puzzle };
  if (raw.kind === "code" && id(raw.lock) && typeof raw.code === "string" && raw.code.length <= 40) {
    return { kind: "code", lock: raw.lock, code: raw.code };
  }
  return null;
}

/** Untrusted events from a request; null if malformed or too many. */
export function parseGroupEvents(raw: unknown): GroupEvent[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > GROUP.maxEvents) return null;
  const events: GroupEvent[] = [];
  for (const item of raw) {
    if (!isRecord(item) || !id(item.scene)) return null;
    const event = parseEvent(item.event);
    if (!event) return null;
    events.push({ scene: item.scene, event });
  }
  return events;
}

/** What the others are told about: a puzzle solved, a lock opened, the way out found. Switches are the author's business. */
export type GroupNews = { kind: "solved" | "opened" | "won"; target: string };

/**
 * Replays events on a shared state; the scene must exist, each event must be accepted there. Used by the server on
 * the round's state, and by the app for events the server has not confirmed yet.
 */
export function applyGroupEvents(
  data: EscapeRoomData,
  shared: Shared,
  events: readonly GroupEvent[],
): { shared: Shared; news: GroupNews[]; refused: number } {
  const news: GroupNews[] = [];
  let refused = 0;
  for (const { scene, event } of events) {
    if (!data.scenes.some((s) => s.id === scene)) {
      refused++;
      continue;
    }
    const step = applyEvent(data, { scene, shared }, event);
    if (!step.accepted) {
      refused++;
      continue;
    }
    const after = step.progress.shared;
    for (const p of after.solved) if (!shared.solved.includes(p)) news.push({ kind: "solved", target: p });
    for (const l of after.opened) if (!shared.opened.includes(l)) news.push({ kind: "opened", target: l });
    if (after.won && !shared.won) news.push({ kind: "won", target: "" });
    shared = after;
  }
  return { shared, news, refused };
}

export function sameShared(a: Shared, b: Shared): boolean {
  return a.won === b.won && a.flags.join() === b.flags.join() && a.solved.join() === b.solved.join() && a.opened.join() === b.opened.join();
}

/** A shared state from the server, limited to the ids the room knows (so it fits the saved game). */
export function sharedFor(data: EscapeRoomData, raw: { flags: unknown; solved: unknown; opened: unknown; won: unknown }): Shared {
  const known = (list: unknown, ids: readonly string[]) =>
    Array.isArray(list) ? [...new Set(list.filter((x): x is string => typeof x === "string" && ids.includes(x)))].sort() : [];
  return {
    flags: known(raw.flags, data.flags.map((f) => f.id)),
    solved: known(raw.solved, data.puzzles.map((p) => p.id)),
    opened: known(raw.opened, data.locks.map((l) => l.id)),
    won: raw.won === true,
  };
}

// --- What the server sends (round_state() in 0017_rounds.sql) ---

export type RoundPlayer = { id: string; name: string; seenAt: string };
export type RoundNews = GroupNews & { id: number; player: string | null };

export type RoundState = {
  round: string;
  room: string;
  code: string;
  me: string; // this player's id
  startedAt: string;
  wonAt: string | null;
  expired: boolean; // no more events; the round stays visible until the cleanup removes it
  shared: { flags: unknown; solved: unknown; opened: unknown; won: unknown }; // checked against the room by sharedFor
  players: RoundPlayer[];
  news: RoundNews[]; // after `since`, oldest first
  lastNews: number; // the newest news id (0 if none)
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const isTime = (value: unknown): value is string => typeof value === "string" && !Number.isNaN(Date.parse(value));

/** Checks what round_state() returned; null for "no such player" (left, or the round is gone). */
export function parseRoundState(raw: unknown): RoundState | null {
  if (!isRecord(raw)) return null;
  const { round, room, code, me, startedAt, wonAt, expired, players, news, lastNews } = raw;
  if (typeof round !== "string" || !UUID.test(round) || typeof room !== "string" || !UUID.test(room)) return null;
  if (!isRoundCode(code) || typeof me !== "string" || !isTime(startedAt) || !(wonAt === null || isTime(wonAt))) return null;
  if (!Array.isArray(players) || !Array.isArray(news)) return null;
  return {
    round,
    room,
    code,
    me,
    startedAt,
    wonAt,
    expired: expired === true,
    shared: { flags: raw.flags, solved: raw.solved, opened: raw.opened, won: wonAt !== null },
    players: players.flatMap((p): RoundPlayer[] =>
      isRecord(p) && typeof p.id === "string" && typeof p.name === "string" && isTime(p.seenAt) ? [{ id: p.id, name: p.name, seenAt: p.seenAt }] : [],
    ),
    news: news.flatMap((n): RoundNews[] =>
      isRecord(n) && Number.isSafeInteger(n.id) && (n.kind === "solved" || n.kind === "opened" || n.kind === "won") && typeof n.target === "string"
        ? [{ id: n.id as number, player: typeof n.player === "string" ? n.player : null, kind: n.kind, target: n.target }]
        : [],
    ),
    lastNews: Number.isSafeInteger(lastNews) ? (lastNews as number) : 0,
  };
}

/** The union of what this device knows and what the server sent; never smaller than either. */
export function mergeServerShared(data: EscapeRoomData, local: Shared, state: RoundState): Shared {
  return mergeShared(local, sharedFor(data, state.shared));
}
