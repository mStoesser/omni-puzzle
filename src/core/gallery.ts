import type { Api } from "./api.ts";
import { isLevel } from "./difficulty.ts";
import type { Level } from "./difficulty.ts";
import { isPuzzleLang } from "./types.ts";
import type { PuzzleLang } from "./types.ts";
import { parsePreviewSource } from "./preview.ts";
import type { PreviewSource } from "./preview.ts";
import { parseTheme } from "./puzzle-theme.ts";
import type { PuzzleTheme } from "./puzzle-theme.ts";

export type GallerySort = "new" | "likes" | "plays" | "hardest";
export const GALLERY_SORTS: readonly GallerySort[] = ["new", "likes", "plays", "hardest"];

/** Puzzles or chains (M24). Chains have no type, level, likes or difficulty, so only "new" and "plays" apply. */
export type GalleryView = "puzzles" | "chains";
export const CHAIN_SORTS: readonly GallerySort[] = ["new", "plays"];

/**
 * What the gallery shows; part of the route, so back navigation and links keep it.
 * `lang` (M28): null = all languages, including puzzles without one. `q` (M37): search by title or author, in both
 * views; null = no search (normalized by normalizeSearch).
 */
export type GalleryFilter = {
  view: GalleryView;
  type: string | null;
  level: Level | null;
  lang: PuzzleLang | null;
  sort: GallerySort;
  q: string | null;
};
export const DEFAULT_FILTER: GalleryFilter = { view: "puzzles", type: null, level: null, lang: null, sort: "new", q: null };

// --- Search (M37) ---

/** Shorter searches find too much to be useful; longer ones are cut. */
export const SEARCH = { minLength: 2, maxLength: 60, maxWords: 5 } as const;

/**
 * The search as the user meant it, without characters that have a meaning in PostgREST filters or LIKE patterns
 * (`*`, `%`, `_`, commas, parentheses, quotes, backslashes …): they become spaces. Letters, digits, spaces, dots,
 * apostrophes and hyphens stay. null if too short.
 */
export function normalizeSearch(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const clean = raw
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}\s.'’-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SEARCH.maxLength)
    .trim();
  return clean.length >= SEARCH.minLength ? clean : null;
}

/**
 * The PostgREST `and` filter for a normalized search: every word must occur in `search_text` (lowercase title and
 * author name, supabase/migrations/0015_search.sql). Values are quoted, so dots and apostrophes are safe.
 */
export function searchCondition(q: string): string {
  const words = [...new Set(q.toLowerCase().split(" ").filter(Boolean))].slice(0, SEARCH.maxWords);
  return `(${words.map((word) => `search_text.ilike."*${word}*"`).join(",")})`;
}

export const PAGE_SIZE = 20;

/** A card in the gallery. `contentKey` = progressKey, to show whether it was solved on this device. */
export type GalleryItem = {
  id: string;
  type: string;
  title: string;
  author: string | null;
  contentKey: string;
  minMoves: number | null;
  level: Level | null;
  lang: PuzzleLang | null;
  theme: PuzzleTheme | null; // M29: colors of the board, for the card preview
  preview: PreviewSource | null; // M32: starting position for the card; null for a quiz or very large data
  likeCount: number;
  playCount: number;
  ratingSum: number;
  ratingCount: number;
  publishedAt: string;
};

/** Where the next page starts: the sort value and id of the last item (keyset pagination). */
export type GalleryCursor = { value: string | number; id: string };

const SORT_COLUMN: Record<GallerySort, "published_at" | "like_count" | "play_count" | "hardness"> = {
  new: "published_at",
  likes: "like_count",
  plays: "play_count",
  hardest: "hardness",
};

type Row = {
  id: string;
  type: string;
  title: string;
  content_key: string;
  min_moves: number | null;
  difficulty: number | null;
  lang: string | null;
  theme?: unknown; // doc->meta->theme, untrusted
  preview?: unknown; // preview_data(puzzles), untrusted
  like_count: number;
  play_count: number;
  rating_sum: number;
  rating_count: number;
  published_at: string;
  hardness: number;
  author: { username: string } | null;
};

const SELECT =
  "id,type,title,content_key,min_moves,difficulty,lang,theme:doc->meta->theme,preview:preview_data,like_count,play_count,rating_sum,rating_count," +
  "published_at,hardness," +
  "author:profiles!puzzles_author_id_fkey(username)";

/** PostgREST query parameters for one page; pure, so it is tested without a server. */
export function galleryQuery(filter: GalleryFilter, cursor: GalleryCursor | null, limit: number): Record<string, string> {
  const column = SORT_COLUMN[filter.sort];
  const query: Record<string, string> = {
    select: SELECT,
    hidden: "is.false", // authors would otherwise see their own hidden puzzles here
    order: `${column}.desc,id.desc`,
    limit: String(limit),
  };
  if (filter.type) query.type = `eq.${filter.type}`;
  if (filter.level) query.difficulty = `eq.${filter.level}`;
  if (filter.lang) query.lang = `eq.${filter.lang}`;
  if (filter.q) query.and = searchCondition(filter.q);
  if (cursor) query.or = afterCursor(column, cursor);
  return query;
}

/** PostgREST `or` filter for the rows after the cursor in (column desc, id desc) order. Values are quoted for timestamps. */
export function afterCursor(column: string, cursor: GalleryCursor): string {
  const value = JSON.stringify(String(cursor.value));
  return `(${column}.lt.${value},and(${column}.eq.${value},id.lt.${cursor.id}))`;
}

function toItem(row: Row): GalleryItem {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    author: row.author?.username ?? null,
    contentKey: row.content_key,
    minMoves: row.min_moves,
    level: isLevel(row.difficulty) ? row.difficulty : null,
    lang: isPuzzleLang(row.lang) ? row.lang : null,
    theme: parseTheme(row.theme),
    preview: parsePreviewSource(row.preview),
    likeCount: row.like_count,
    playCount: row.play_count,
    ratingSum: row.rating_sum,
    ratingCount: row.rating_count,
    publishedAt: row.published_at,
  };
}

/** One page; `next` is null on the last page. */
export async function fetchGalleryPage(
  api: Api,
  filter: GalleryFilter,
  cursor: GalleryCursor | null,
  pageSize = PAGE_SIZE,
): Promise<{ items: GalleryItem[]; next: GalleryCursor | null }> {
  // One extra row tells whether there is another page.
  const rows = await api.rest<Row[]>("puzzles", { query: galleryQuery(filter, cursor, pageSize + 1) });
  const page = rows.slice(0, pageSize);
  const last = page.at(-1);
  const next = rows.length > pageSize && last ? { value: last[SORT_COLUMN[filter.sort]], id: last.id } : null;
  return { items: page.map(toItem), next };
}

/**
 * Parses the query part of a gallery route ("type=laser&level=2&sort=likes", "view=chains&sort=plays");
 * invalid values fall back to defaults.
 */
export function parseGalleryFilter(search: string): GalleryFilter {
  const params = new URLSearchParams(search);
  const sort = params.get("sort") as GallerySort | null;
  const q = normalizeSearch(params.get("q"));
  if (params.get("view") === "chains") {
    return { view: "chains", type: null, level: null, lang: null, sort: sort !== null && CHAIN_SORTS.includes(sort) ? sort : "new", q };
  }
  const type = params.get("type");
  const level = Number(params.get("level"));
  const lang = params.get("lang");
  return {
    view: "puzzles",
    type: type !== null && /^[a-z0-9-]{1,32}$/.test(type) ? type : null,
    level: isLevel(level) ? level : null,
    lang: isPuzzleLang(lang) ? lang : null,
    sort: sort !== null && GALLERY_SORTS.includes(sort) ? sort : "new",
    q,
  };
}

/** The query part for a filter, without defaults ("" for the default filter). */
export function formatGalleryFilter(filter: GalleryFilter): string {
  const params = new URLSearchParams();
  if (filter.view === "chains") params.set("view", "chains");
  if (filter.type) params.set("type", filter.type);
  if (filter.level) params.set("level", String(filter.level));
  if (filter.lang) params.set("lang", filter.lang);
  if (filter.sort !== "new") params.set("sort", filter.sort);
  if (filter.q) params.set("q", filter.q);
  return params.toString();
}
