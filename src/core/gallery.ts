import type { Api } from "./api.ts";
import { isLevel } from "./difficulty.ts";
import type { Level } from "./difficulty.ts";

export type GallerySort = "new" | "likes" | "plays" | "hardest";
export const GALLERY_SORTS: readonly GallerySort[] = ["new", "likes", "plays", "hardest"];

/** What the gallery shows; part of the route, so back navigation and links keep it. */
export type GalleryFilter = { type: string | null; level: Level | null; sort: GallerySort };
export const DEFAULT_FILTER: GalleryFilter = { type: null, level: null, sort: "new" };

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
  like_count: number;
  play_count: number;
  rating_sum: number;
  rating_count: number;
  published_at: string;
  hardness: number;
  author: { username: string } | null;
};

const SELECT =
  "id,type,title,content_key,min_moves,difficulty,like_count,play_count,rating_sum,rating_count,published_at,hardness," +
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
  if (cursor) {
    // Rows after the cursor in (column desc, id desc) order. Values are quoted for timestamps.
    const value = JSON.stringify(String(cursor.value));
    query.or = `(${column}.lt.${value},and(${column}.eq.${value},id.lt.${cursor.id}))`;
  }
  return query;
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

/** Parses the query part of a gallery route ("type=laser&level=2&sort=likes"); invalid values fall back to defaults. */
export function parseGalleryFilter(search: string): GalleryFilter {
  const params = new URLSearchParams(search);
  const type = params.get("type");
  const level = Number(params.get("level"));
  const sort = params.get("sort") as GallerySort | null;
  return {
    type: type !== null && /^[a-z0-9-]{1,32}$/.test(type) ? type : null,
    level: isLevel(level) ? level : null,
    sort: sort !== null && GALLERY_SORTS.includes(sort) ? sort : "new",
  };
}

/** The query part for a filter, without defaults ("" for the default filter). */
export function formatGalleryFilter(filter: GalleryFilter): string {
  const params = new URLSearchParams();
  if (filter.type) params.set("type", filter.type);
  if (filter.level) params.set("level", String(filter.level));
  if (filter.sort !== "new") params.set("sort", filter.sort);
  return params.toString();
}
