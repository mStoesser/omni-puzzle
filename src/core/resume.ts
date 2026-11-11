// "Weiterspielen" (M36): the one unfinished puzzle last played on this device, to continue later. Pure.
//
// Stored are the moves (the path from the start, like for leaderboards) and the time so far, never a play state:
// replaying the moves with applyMove works across app versions, as long as the rules accept them. If they do not
// (the puzzle changed, a move is rejected), the attempt starts fresh and the saved one is dropped.
// Only on this device (IndexedDB meta store), not synced.

import { parseTheme } from "./puzzle-theme.ts";
import type { PuzzleTheme } from "./puzzle-theme.ts";
import { createSession, dispatch } from "./session.ts";
import type { AnyPlaySession } from "./session.ts";
import type { AnyPuzzleType } from "./types.ts";

export const RESUME_KEY = "resume";
/** Same limit as the server's replay (submit-score); a longer attempt is not saved. */
export const MAX_RESUME_MOVES = 5000;

export type Resume = {
  route: string; // hash to open the puzzle again, e.g. "#/g/<id>" or "#/c/<id>/2"
  contentKey: string; // progressKey: the attempt belongs to exactly this content
  moves: unknown[];
  elapsedMs: number;
  savedAt: string;
  // For the home card: what it shows, without loading the puzzle.
  type: string;
  title: string;
  typeVersion: number;
  data: unknown;
  theme?: PuzzleTheme;
};

const KEY = /^[0-9a-f]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A stored entry, or null if it is malformed. The data itself is checked when it is drawn or played. */
export function parseResume(raw: unknown): Resume | null {
  if (!isRecord(raw)) return null;
  const { route, contentKey, moves, elapsedMs, savedAt, type, title, typeVersion, data } = raw;
  if (typeof route !== "string" || !route.startsWith("#/") || route.length > 20_000) return null;
  if (typeof contentKey !== "string" || !KEY.test(contentKey)) return null;
  if (!Array.isArray(moves) || moves.length === 0 || moves.length > MAX_RESUME_MOVES) return null;
  if (typeof elapsedMs !== "number" || !Number.isFinite(elapsedMs) || elapsedMs < 0) return null;
  if (typeof savedAt !== "string" || typeof type !== "string" || typeof title !== "string") return null;
  if (!Number.isInteger(typeVersion) || (typeVersion as number) < 1 || data === undefined) return null;
  const resume: Resume = { route, contentKey, moves, elapsedMs, savedAt, type, title, typeVersion: typeVersion as number, data };
  const theme = parseTheme(raw.theme);
  if (theme) resume.theme = theme;
  return resume;
}

/**
 * The session after replaying `moves` from the start, or null if a move is rejected, the puzzle ends up solved
 * (nothing to continue) or there are too many moves.
 */
export function replay(type: AnyPuzzleType, data: unknown, moves: readonly unknown[]): AnyPlaySession | null {
  if (moves.length > MAX_RESUME_MOVES) return null;
  let session = createSession(type, data);
  for (const move of moves) {
    const next = dispatch(session, move);
    if (next === session) return null; // rejected (or already solved before the last move)
    session = next;
  }
  return session.solved ? null : session;
}

/** What to do with the saved attempt after a change of the current one: keep it, save this one, or drop it. */
export function resumeAction(
  current: { contentKey: string; moves: number; solved: boolean },
  saved: Resume | null,
): "save" | "clear" | "keep" {
  if (current.solved || current.moves === 0) return saved?.contentKey === current.contentKey ? "clear" : "keep";
  return current.moves > MAX_RESUME_MOVES ? "keep" : "save";
}
