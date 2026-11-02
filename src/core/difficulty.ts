import type { AnyPuzzleRules } from "./types.ts";

/** Common difficulty scale of all puzzle types: 1 = easy, 2 = medium, 3 = hard. */
export type Level = 1 | 2 | 3;

export const LEVELS: readonly Level[] = [1, 2, 3];

export function isLevel(value: unknown): value is Level {
  return value === 1 || value === 2 || value === 3;
}

/** The level of a solved puzzle; null if the type measures difficulty otherwise (ratings). */
export function levelFromMoves(rules: AnyPuzzleRules, minMoves: number): Level | null {
  if (!rules.levels) return null;
  if (minMoves <= rules.levels.easy) return 1;
  return minMoves <= rules.levels.medium ? 2 : 3;
}

/** The level from the average of 1–5 ratings: 1–2 easy, 3 medium, 4–5 hard (used from M12). */
export function levelFromRating(average: number): Level {
  if (average < 2.5) return 1;
  return average < 3.5 ? 2 : 3;
}
