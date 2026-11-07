import { ApiError, apiErrorText } from "./api.ts";
import type { Api } from "./api.ts";
import { isDay } from "./day.ts";
import { PUBLISHED_ID } from "./published.ts";
import type { AnyPuzzleRules } from "./types.ts";
import type { MessageKey } from "../i18n/t.ts";

// Leaderboards of published puzzles (M25). Shared by the app and the Edge Function "submit-score"
// (src/server/score-handler.ts); the checks below run on the server, so they must stay DOM-free.

export const SCORE = {
  maxMoves: 5000, // longer move lists are refused (CPU time of the function)
  maxTimeMs: 24 * 60 * 60 * 1000,
  maxRequestBytes: 512_000, // 5000 moves of the largest kind (a nonogram stroke) fit
  top: 10, // entries shown; the own one is added below if it is further down
  queueSize: 10, // results waiting for a connection
} as const;

/**
 * What the app sends: the puzzle, the moves of the solution (see session.path) and the measured time.
 * `daily` (M26): solved as the puzzle of that day, so it also enters the day's leaderboard and the streak.
 */
export type ScoreRequest = { puzzle: string; moves: unknown[]; timeMs: number; daily?: string };

/**
 * For the puzzle of the day: "recorded" = first solution of the day, now on the day's leaderboard; "repeat" = only
 * the first solution counts; "expired" = it is no longer that day's puzzle (or the day is over).
 */
export type DailyOutcome = "recorded" | "repeat" | "expired";

/** `improved` false: not better than the stored result (always false for own puzzles of the day). */
export type ScoreResult = { improved: boolean; daily?: DailyOutcome };

export type ScoreErrorCode =
  | "invalid-request"
  | "invalid-time" // not an integer between 1 ms and 24 h
  | "too-many-moves"
  | "invalid-moves" // a move is malformed, not allowed, or follows the solving one
  | "not-solved"; // the moves do not end in a solved state

export class ScoreError extends Error {
  readonly code: ScoreErrorCode;

  constructor(code: ScoreErrorCode, message?: string) {
    super(message ?? code);
    this.name = "ScoreError";
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Checks the shape of an untrusted request; the moves are checked by replaying them (checkSolution). */
export function parseScoreRequest(input: unknown): ScoreRequest {
  if (!isRecord(input) || typeof input.puzzle !== "string" || !PUBLISHED_ID.test(input.puzzle) || !Array.isArray(input.moves)) {
    throw new ScoreError("invalid-request");
  }
  const { timeMs } = input;
  if (!Number.isInteger(timeMs) || (timeMs as number) < 1 || (timeMs as number) > SCORE.maxTimeMs) {
    throw new ScoreError("invalid-time");
  }
  if (input.daily !== undefined && !isDay(input.daily)) throw new ScoreError("invalid-request");
  if (input.moves.length > SCORE.maxMoves) throw new ScoreError("too-many-moves");
  const request: ScoreRequest = { puzzle: input.puzzle, moves: input.moves, timeMs: timeMs as number };
  if (input.daily !== undefined) request.daily = input.daily;
  return request;
}

/**
 * Replays untrusted moves on validated data, like the play session does: every move must be accepted by applyMove,
 * none may follow the solving one, and the last state must be solved. Returns the number of moves (counted here,
 * not taken from the client).
 */
export function checkSolution(rules: AnyPuzzleRules, data: unknown, moves: readonly unknown[]): number {
  if (moves.length > SCORE.maxMoves) throw new ScoreError("too-many-moves");
  let state = rules.initState(data);
  let solved = rules.isSolved(data, state);
  for (const move of moves) {
    if (solved) throw new ScoreError("invalid-moves", "move after solving");
    let next: unknown;
    try {
      next = rules.applyMove(data, state, move);
    } catch {
      next = null; // e.g. null instead of an object; applyMove only has to handle well-formed moves
    }
    if (next === null) throw new ScoreError("invalid-moves");
    state = next;
    solved = rules.isSolved(data, state);
  }
  if (!solved) throw new ScoreError("not-solved");
  return moves.length;
}

// --- App side ---

export type LeaderboardEntry = {
  place: number; // equal results share a place
  userId: string;
  username: string;
  moves: number | null; // null if the type ranks by time only
  timeMs: number;
  achievedAt: string;
  isMe: boolean;
};

/** `entries`: the top 10, plus the own entry if it is further down. `total`: all ranked players. */
export type Leaderboard = { entries: LeaderboardEntry[]; total: number };

export type LeaderboardRow = {
  place: number;
  user_id: string;
  username: string;
  moves: number | null;
  time_ms: number;
  achieved_at: string;
  is_me: boolean;
  total: number;
};

export async function fetchLeaderboard(api: Api, puzzleId: string): Promise<Leaderboard> {
  return toLeaderboard(await api.rest<LeaderboardRow[]>("rpc/leaderboard", { body: { puzzle: puzzleId } }));
}

/** Rows of leaderboard() or daily_leaderboard(). */
export function toLeaderboard(rows: readonly LeaderboardRow[]): Leaderboard {
  return {
    entries: rows.map((r) => ({
      place: r.place,
      userId: r.user_id,
      username: r.username,
      moves: r.moves,
      timeMs: r.time_ms,
      achievedAt: r.achieved_at,
      isMe: r.is_me,
    })),
    total: rows[0]?.total ?? 0,
  };
}

/** The own entry, if ranked. */
export function myEntry(board: Leaderboard): LeaderboardEntry | null {
  return board.entries.find((e) => e.isMe) ?? null;
}

export async function submitScore(api: Api, request: ScoreRequest): Promise<ScoreResult> {
  return api.functions<ScoreResult>("submit-score", { body: request });
}

/** Moderators: removes all entries of a user from every leaderboard. */
export async function clearScores(api: Api, userId: string): Promise<void> {
  await api.rest("rpc/mod_clear_scores", { body: { target: userId } });
}

/** Whether a failed submission should wait for a connection instead of being dropped. */
export function isRetryable(error: unknown): boolean {
  return error instanceof ApiError && (error.kind === "offline" || error.kind === "timeout" || error.kind === "server");
}

export function scoreErrorText(error: unknown): MessageKey {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "banned":
        return "scoreBanned";
      case "own":
        return "scoreOwn";
      case "not-solved":
      case "invalid-moves":
      case "too-many-moves":
        return "scoreRejected";
      case "invalid-time":
        return "scoreInvalidTime";
    }
  }
  return apiErrorText(error);
}

// --- Offline queue (localStorage) ---

/** A result waiting for a connection; only sent while the same user is signed in. */
export type PendingScore = ScoreRequest & { userId: string };

export function parseQueue(text: string | null): PendingScore[] {
  let value: unknown;
  try {
    value = JSON.parse(text ?? "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): PendingScore[] => {
    if (!isRecord(item) || typeof item.userId !== "string") return [];
    try {
      return [{ ...parseScoreRequest(item), userId: item.userId }];
    } catch {
      return [];
    }
  });
}

/** Adds a result; beyond the limit the oldest drop out. Several results for one puzzle are fine, the server keeps the best. */
export function enqueue(queue: readonly PendingScore[], item: PendingScore): PendingScore[] {
  return [...queue, item].slice(-SCORE.queueSize);
}
