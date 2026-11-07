import { ApiError, apiErrorText } from "./api.ts";
import type { Api } from "./api.ts";
import { addDays, isDay } from "./day.ts";
import { isLevel } from "./difficulty.ts";
import type { Level } from "./difficulty.ts";
import { toLeaderboard } from "./scores.ts";
import type { Leaderboard, LeaderboardRow } from "./scores.ts";
import type { MessageKey } from "../i18n/t.ts";

// Puzzle of the day (M26). The server chooses it (daily_puzzle() in supabase/migrations/0011_daily.sql) and decides
// which day it is; solutions are checked and stored by the Edge Function "submit-score" with `daily` set.

export type DailyPuzzle = { id: string; title: string; type: string; level: Level | null; contentKey: string };

/**
 * Today's puzzle; `puzzle` is null if there is nothing to choose from. `solved` and `streak` come from the server
 * for signed-in players (`streak` null when signed out).
 */
export type Daily = { day: string; puzzle: DailyPuzzle | null; solved: boolean; streak: number | null };

type DailyRow = {
  day: string;
  puzzle_id: string | null;
  title: string | null;
  type: string | null;
  difficulty: number | null;
  content_key: string | null;
  solved: boolean;
  streak: number | null;
};

export async function fetchDaily(api: Api): Promise<Daily> {
  // POST: the function may choose and store the puzzle, so it must not run in a read-only transaction.
  const rows = await api.rest<DailyRow[]>("rpc/daily_puzzle", { method: "POST", body: {} });
  const row = rows[0];
  if (!row || !isDay(row.day)) throw new ApiError("server", 200, "daily_puzzle returned no day");
  const puzzle =
    row.puzzle_id && row.title !== null && row.type && row.content_key
      ? { id: row.puzzle_id, title: row.title, type: row.type, level: isLevel(row.difficulty) ? row.difficulty : null, contentKey: row.content_key }
      : null;
  return { day: row.day, puzzle, solved: row.solved === true, streak: typeof row.streak === "number" ? row.streak : null };
}

/** The leaderboard of a day: only the first solution of each player counts. */
export async function fetchDailyLeaderboard(api: Api, day: string): Promise<Leaderboard> {
  return toLeaderboard(await api.rest<LeaderboardRow[]>("rpc/daily_leaderboard", { body: { for_day: day } }));
}

// --- Streak ---

/** Days solved in a row, up to `today`, or up to yesterday while today is still open. `days` in any order. */
export function streak(days: readonly string[], today: string): number {
  const solved = new Set(days);
  let day = solved.has(today) ? today : addDays(today, -1);
  let count = 0;
  while (solved.has(day)) {
    count++;
    day = addDays(day, -1);
  }
  return count;
}

/**
 * What the home page shows. Signed in, the server's numbers count; a solution of today that is still on its way
 * (offline queue) is added, because the server's streak then ends yesterday. Signed out, the days solved on this
 * device count.
 */
export function dailyStatus(daily: Daily, localDays: readonly string[]): { solved: boolean; streak: number } {
  const solvedHere = localDays.includes(daily.day);
  if (daily.streak === null) return { solved: solvedHere, streak: streak(localDays, daily.day) };
  if (daily.solved || !solvedHere) return { solved: daily.solved, streak: daily.streak };
  return { solved: true, streak: daily.streak + 1 };
}

// Days solved on this device, in localStorage. A year is plenty for a streak; older days drop out.
export const MAX_LOCAL_DAYS = 400;

export function parseLocalDays(text: string | null): string[] {
  let value: unknown;
  try {
    value = JSON.parse(text ?? "[]");
  } catch {
    return [];
  }
  return Array.isArray(value) ? [...new Set(value.filter(isDay))].sort() : [];
}

/** Adds a solved day; returns the same list if it is already in. */
export function addLocalDay(days: readonly string[], day: string): readonly string[] {
  if (days.includes(day)) return days;
  return [...days, day].sort().slice(-MAX_LOCAL_DAYS);
}

// --- Moderation ---

export const PLAN_DAYS = 15; // today and the next 14 days

/** A day in the plan; `puzzle` null = chosen automatically on that day. */
export type PlannedDay = {
  day: string;
  puzzle: { id: string; title: string; type: string; hidden: boolean } | null;
  plannedBy: string | null; // username; null = chosen automatically (or the moderator's account is gone)
};

type PlanRow = { day: string; puzzle_id: string | null; title: string | null; type: string | null; hidden: boolean | null; planned_by: string | null };

export async function fetchDailyPlan(api: Api): Promise<PlannedDay[]> {
  const rows = await api.rest<PlanRow[]>("rpc/mod_daily_plan", { method: "POST", body: {} });
  return rows.map((r) => ({
    day: r.day,
    puzzle: r.puzzle_id && r.title !== null && r.type ? { id: r.puzzle_id, title: r.title, type: r.type, hidden: r.hidden === true } : null,
    plannedBy: r.planned_by,
  }));
}

/** Plans a puzzle for a day; planning today replaces today's puzzle. */
export async function planDaily(api: Api, day: string, puzzleId: string): Promise<void> {
  await api.rest("rpc/mod_plan_daily", { body: { for_day: day, puzzle: puzzleId } });
}

/** Removes a planned future day; it is then chosen automatically. */
export async function unplanDaily(api: Api, day: string): Promise<void> {
  await api.rest("rpc/mod_unplan_daily", { body: { for_day: day } });
}

export function planErrorText(error: unknown): MessageKey {
  if (error instanceof ApiError && error.code === "PT400") {
    return error.message === "unsuitable" ? "dailyPlanUnsuitable" : "dailyPlanDay";
  }
  return apiErrorText(error);
}
