import { ApiError, apiErrorText } from "./api.ts";
import type { Api } from "./api.ts";
import { afterCursor, PAGE_SIZE } from "./gallery.ts";
import type { GalleryCursor, GallerySort } from "./gallery.ts";
import { PUBLISHED_ID } from "./published.ts";
import type { MessageKey } from "../i18n/t.ts";

// Puzzle chains (M24): an ordered list of published puzzles with a text before each one and a closing text.
// Created only by the database function publish_chain (supabase/migrations/0009_chains.sql), which checks the same limits.

export const CHAIN = {
  minSteps: 2,
  maxSteps: 20,
  maxTitle: 200,
  maxDescription: 2000,
  maxText: 500, // text before a puzzle
  maxOutro: 2000,
  perDay: 5,
} as const;

/** `key` is the content_key of the puzzle, stored when publishing, so progress shows without loading the puzzles. */
export type ChainStep = { puzzle: string; key: string; text: string };

export type Chain = {
  id: string;
  title: string;
  description: string;
  steps: ChainStep[];
  outro: string;
  author: string | null; // null if the profile is gone
  authorId: string;
  playCount: number;
  publishedAt: string;
  hidden: boolean; // only visible to its author and moderators
};

/** A chain as a gallery card. */
export type ChainItem = Pick<Chain, "id" | "title" | "author" | "playCount" | "publishedAt"> & { stepKeys: string[] };

/** One of the user's own chains, for the account page. */
export type OwnChain = Pick<Chain, "id" | "title" | "description" | "playCount" | "publishedAt" | "hidden"> & { stepCount: number };

/** What the chain page needs of a step's puzzle; `null` = withdrawn, or hidden by moderation. */
export type StepPuzzle = { title: string; type: string };

const KEY = /^[0-9a-f]{64}$/;

/** Steps come from the backend and are untrusted like everything else; broken entries are left out. */
export function parseSteps(raw: unknown): ChainStep[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((step: unknown) => {
    if (typeof step !== "object" || step === null) return [];
    const { puzzle, key, text } = step as Record<string, unknown>;
    if (typeof puzzle !== "string" || !PUBLISHED_ID.test(puzzle) || typeof key !== "string" || !KEY.test(key)) return [];
    return [{ puzzle, key, text: typeof text === "string" ? text : "" }];
  });
}

type Row = {
  id: string;
  author_id: string;
  title: string;
  description: string;
  steps: unknown;
  outro: string;
  play_count: number;
  published_at: string;
  hidden: boolean;
  author: { username: string } | null;
};

const AUTHOR = "author:profiles!chains_author_id_fkey(username)";

export async function fetchChain(api: Api, id: string): Promise<Chain | null> {
  const rows = await api.rest<Row[]>("chains", {
    query: { id: `eq.${id}`, select: `id,author_id,title,description,steps,outro,play_count,published_at,hidden,${AUTHOR}` },
  });
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    steps: parseSteps(row.steps),
    outro: row.outro,
    author: row.author?.username ?? null,
    authorId: row.author_id,
    playCount: row.play_count,
    publishedAt: row.published_at,
    hidden: row.hidden,
  };
}

/**
 * Title and type of the steps' puzzles. Puzzles that are gone or hidden are missing from the map; hidden ones count as
 * unavailable even for their author and moderators, who would otherwise get them from RLS.
 */
export async function fetchStepPuzzles(api: Api, ids: readonly string[]): Promise<Map<string, StepPuzzle>> {
  const valid = ids.filter((id) => PUBLISHED_ID.test(id));
  if (valid.length === 0) return new Map();
  const rows = await api.rest<{ id: string; title: string; type: string }[]>("puzzles", {
    query: { id: `in.(${valid.join(",")})`, hidden: "is.false", select: "id,title,type" },
  });
  return new Map(rows.map((r) => [r.id, { title: r.title, type: r.type }]));
}

export type StepState = "solved" | "open" | "locked" | "unavailable";

export type ChainProgress = {
  states: StepState[];
  /** Index of the step to play next, or null when the chain is complete. */
  current: number | null;
  solvedCount: number; // solved steps (unavailable ones are not counted)
  availableCount: number;
};

/**
 * A step is unlocked when every step before it is solved or unavailable (those count as skipped). Steps solved
 * elsewhere (e.g. in the gallery) show as solved even when they are not unlocked yet.
 */
export function chainProgress(steps: readonly ChainStep[], available: (step: ChainStep) => boolean, solved: (key: string) => boolean): ChainProgress {
  let current: number | null = null;
  let solvedCount = 0;
  let availableCount = 0;
  const states = steps.map((step, i): StepState => {
    if (!available(step)) return "unavailable";
    availableCount++;
    if (solved(step.key)) {
      solvedCount++;
      return "solved";
    }
    if (current === null) {
      current = i;
      return "open";
    }
    return "locked";
  });
  return { states, current, solvedCount, availableCount };
}

/** Whether step `index` may be played: no unsolved available step before it. */
export function isUnlocked(progress: ChainProgress, index: number): boolean {
  const state = progress.states[index];
  if (state === undefined || state === "unavailable") return false;
  return progress.current === null || index <= progress.current;
}

// --- Gallery ---

const CHAIN_SORT_COLUMN: Partial<Record<GallerySort, "published_at" | "play_count">> = { new: "published_at", plays: "play_count" };

/** PostgREST query parameters for one page of chains; sorts other than "new" and "plays" fall back to "new". */
export function chainGalleryQuery(sort: GallerySort, cursor: GalleryCursor | null, limit: number): Record<string, string> {
  const column = CHAIN_SORT_COLUMN[sort] ?? "published_at";
  const query: Record<string, string> = {
    select: `id,title,steps,play_count,published_at,${AUTHOR}`,
    hidden: "is.false",
    order: `${column}.desc,id.desc`,
    limit: String(limit),
  };
  if (cursor) query.or = afterCursor(column, cursor);
  return query;
}

export async function fetchChainPage(
  api: Api,
  sort: GallerySort,
  cursor: GalleryCursor | null,
  pageSize = PAGE_SIZE,
): Promise<{ items: ChainItem[]; next: GalleryCursor | null }> {
  const rows = await api.rest<Row[]>("chains", { query: chainGalleryQuery(sort, cursor, pageSize + 1) });
  const page = rows.slice(0, pageSize);
  const last = page.at(-1);
  const column = CHAIN_SORT_COLUMN[sort] ?? "published_at";
  const next = rows.length > pageSize && last ? { value: last[column], id: last.id } : null;
  const items = page.map((row) => ({
    id: row.id,
    title: row.title,
    author: row.author?.username ?? null,
    playCount: row.play_count,
    publishedAt: row.published_at,
    stepKeys: parseSteps(row.steps).map((s) => s.key),
  }));
  return { items, next };
}

// --- Own chains ---

export async function listOwnChains(api: Api, userId: string): Promise<OwnChain[]> {
  const rows = await api.rest<Row[]>("chains", {
    query: { author_id: `eq.${userId}`, select: "id,title,description,steps,play_count,published_at,hidden", order: "published_at.desc" },
  });
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    playCount: row.play_count,
    publishedAt: row.published_at,
    hidden: row.hidden,
    stepCount: parseSteps(row.steps).length,
  }));
}

export async function updateChain(api: Api, id: string, change: { title: string; description: string }): Promise<void> {
  await api.rest("chains", { method: "PATCH", query: { id: `eq.${id}` }, body: change, headers: { Prefer: "return=minimal" } });
}

/** Withdrawing deletes the chain; the puzzles in it stay. */
export async function withdrawChain(api: Api, id: string): Promise<void> {
  await api.rest("chains", { method: "DELETE", query: { id: `eq.${id}` }, headers: { Prefer: "return=minimal" } });
}

/** Counts a play of the chain; like registerPlay, once per device. */
export async function registerChainPlay(api: Api, id: string): Promise<void> {
  await api.rest("rpc/register_chain_play", { body: { chain: id } });
}

// --- Editor ---

/** A step in the chain editor; title and type are shown only, the server looks the puzzle up itself. */
export type DraftStep = { puzzle: string; title: string; type: string; text: string };

export type ChainDraft = { title: string; description: string; outro: string; steps: DraftStep[] };

export const EMPTY_DRAFT: ChainDraft = { title: "", description: "", outro: "", steps: [] };

/** The puzzle id in a pasted link: an id, "#/g/<id>" or a full URL ending in it. */
export function puzzleIdFromLink(text: string): string | null {
  const match = /(?:^|#\/g\/)([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i.exec(text.trim());
  return match ? match[1]!.toLowerCase() : null;
}

export type AddStepProblem = "duplicate" | "full";

export function addStep(draft: ChainDraft, step: DraftStep): ChainDraft | AddStepProblem {
  if (draft.steps.some((s) => s.puzzle === step.puzzle)) return "duplicate";
  if (draft.steps.length >= CHAIN.maxSteps) return "full";
  return { ...draft, steps: [...draft.steps, step] };
}

/** Moves step `index` by `delta` places; out of range changes nothing. */
export function moveStep(draft: ChainDraft, index: number, delta: -1 | 1): ChainDraft {
  const target = index + delta;
  if (index < 0 || index >= draft.steps.length || target < 0 || target >= draft.steps.length) return draft;
  const steps = [...draft.steps];
  [steps[index], steps[target]] = [steps[target]!, steps[index]!];
  return { ...draft, steps };
}

export function removeStep(draft: ChainDraft, index: number): ChainDraft {
  return { ...draft, steps: draft.steps.filter((_, i) => i !== index) };
}

export function setStepText(draft: ChainDraft, index: number, text: string): ChainDraft {
  return { ...draft, steps: draft.steps.map((s, i) => (i === index ? { ...s, text } : s)) };
}

/** The first reason the draft cannot be published yet, or null. Same limits as publish_chain. */
export function draftProblem(draft: ChainDraft): MessageKey | null {
  const title = draft.title.trim();
  if (title === "" || title.length > CHAIN.maxTitle) return "chainInvalidTitle";
  if (draft.description.trim().length > CHAIN.maxDescription) return "chainInvalidDescription";
  if (draft.outro.trim().length > CHAIN.maxOutro) return "chainInvalidOutro";
  if (draft.steps.length < CHAIN.minSteps) return "chainTooFewSteps";
  if (draft.steps.length > CHAIN.maxSteps) return "chainTooManySteps";
  if (draft.steps.some((s) => s.text.trim().length > CHAIN.maxText)) return "chainInvalidText";
  return null;
}

/** Publishes through the database function, which checks the puzzles, the daily limit and bans. Returns the new id. */
export async function publishChain(api: Api, draft: ChainDraft): Promise<string> {
  return api.rest<string>("rpc/publish_chain", {
    body: {
      title: draft.title.trim(),
      description: draft.description.trim(),
      outro: draft.outro.trim(),
      steps: draft.steps.map((s) => ({ puzzle: s.puzzle, text: s.text.trim() })),
    },
  });
}

/** A user-facing text for errors of publish_chain (the exception message is the code). */
export function chainErrorText(error: unknown): MessageKey {
  if (error instanceof ApiError) {
    switch (error.message) {
      case "banned":
        return "publishBanned";
      case "daily-limit":
        return "chainDailyLimit";
      case "invalid-title":
        return "chainInvalidTitle";
      case "invalid-description":
        return "chainInvalidDescription";
      case "invalid-outro":
        return "chainInvalidOutro";
      case "invalid-steps":
        return "chainInvalidSteps";
      case "duplicate-step":
        return "chainDuplicateStep";
      case "unavailable-puzzle":
        return "chainUnavailablePuzzle";
    }
  }
  return apiErrorText(error);
}
