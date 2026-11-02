import type { Api } from "./api.ts";

/** Averages are shown from this many ratings on (also the threshold in supabase/migrations/0006_ratings.sql). */
export const MIN_RATINGS = 3;

/** The signed-in user's like and difficulty rating (1–5) of a published puzzle. */
export type MyReaction = { liked: boolean; rating: number | null };

export async function fetchMyReaction(api: Api, userId: string, puzzleId: string): Promise<MyReaction> {
  const mine = { user_id: `eq.${userId}`, puzzle_id: `eq.${puzzleId}` };
  const [likes, ratings] = await Promise.all([
    api.rest<unknown[]>("likes", { query: { ...mine, select: "puzzle_id" } }),
    api.rest<{ value: number }[]>("ratings", { query: { ...mine, select: "value" } }),
  ]);
  return { liked: likes.length > 0, rating: ratings[0]?.value ?? null };
}

export async function setLike(api: Api, userId: string, puzzleId: string, liked: boolean): Promise<void> {
  if (liked) {
    await api.rest("likes", { body: { user_id: userId, puzzle_id: puzzleId }, headers: { Prefer: "return=minimal" } });
  } else {
    await api.rest("likes", {
      method: "DELETE",
      query: { user_id: `eq.${userId}`, puzzle_id: `eq.${puzzleId}` },
      headers: { Prefer: "return=minimal" },
    });
  }
}

/**
 * Inserts or changes the rating. No PostgREST upsert: it would also update the key columns,
 * and users may only update `value`.
 */
export async function setRating(api: Api, userId: string, puzzleId: string, value: number, existing: boolean): Promise<void> {
  if (existing) {
    await api.rest("ratings", {
      method: "PATCH",
      query: { user_id: `eq.${userId}`, puzzle_id: `eq.${puzzleId}` },
      body: { value },
      headers: { Prefer: "return=minimal" },
    });
  } else {
    await api.rest("ratings", { body: { user_id: userId, puzzle_id: puzzleId, value }, headers: { Prefer: "return=minimal" } });
  }
}

/** The average rating, or null below MIN_RATINGS. */
export function averageRating(sum: number, count: number): number | null {
  return count >= MIN_RATINGS ? sum / count : null;
}

/** "3,4" — one decimal, German format. */
export function formatAverage(average: number): string {
  return average.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** Counters after changing the own rating from `previous` (null = none) to `value`, for optimistic updates. */
export function applyRating(counts: { ratingSum: number; ratingCount: number }, previous: number | null, value: number) {
  return previous === null
    ? { ratingSum: counts.ratingSum + value, ratingCount: counts.ratingCount + 1 }
    : { ratingSum: counts.ratingSum - previous + value, ratingCount: counts.ratingCount };
}
