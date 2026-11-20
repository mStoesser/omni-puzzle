// Escape rooms (M46): published rooms on the server (table rooms, supabase/migrations/0016_rooms.sql). DOM-free; only
// types from the room logic, so the gallery can use this without loading the room part of the app.

import { ApiError, apiErrorText } from "../core/api.ts";
import type { Api } from "../core/api.ts";
import { PAGE_SIZE, afterCursor, searchCondition } from "../core/gallery.ts";
import type { GalleryCursor, GallerySort } from "../core/gallery.ts";
import { IMAGE_KEY } from "../core/images.ts";
import { REPORT_COMMENT_MAX } from "../core/moderation.ts";
import type { ReportReason } from "../core/moderation.ts";
import { isPuzzleLang } from "../core/types.ts";
import type { PuzzleLang } from "../core/types.ts";
import type { MessageKey } from "../i18n/t.ts";
import type { ImageRef } from "./logic.ts";

/** Rooms one account may publish per day; enforced by publish_room() in supabase/migrations/0016_rooms.sql. */
export const ROOM_PER_DAY = 5;

/** A published room as shown on #/r/<id>. `doc` is untrusted and goes through loadEscapeRoom. */
export type PublishedRoom = {
  id: string;
  doc: unknown;
  title: string;
  description: string;
  author: string | null; // null if the profile is gone
  authorId: string;
  playCount: number;
  publishedAt: string;
  hidden: boolean; // only visible to its author and moderators
};

/** A card in the gallery. `contentKey`: the saved game on this device is `room:<contentKey>`. */
export type RoomItem = {
  id: string;
  title: string;
  author: string | null;
  contentKey: string;
  cover: ImageRef | null; // null if the server sent something unexpected
  sceneCount: number;
  puzzleCount: number;
  lang: PuzzleLang | null;
  playCount: number;
  publishedAt: string;
};

/** One of the user's own published rooms, for the account page. */
export type OwnRoom = Pick<PublishedRoom, "id" | "title" | "description" | "playCount" | "publishedAt" | "hidden"> & { sceneCount: number };

type Row = {
  id: string;
  author_id: string;
  doc?: unknown;
  title: string;
  description: string;
  content_key: string;
  cover?: unknown;
  scene_count: number;
  puzzle_count: number;
  lang: string | null;
  play_count: number;
  published_at: string;
  hidden: boolean;
  author: { username: string } | null;
};

const AUTHOR = "author:profiles!rooms_author_id_fkey(username)";

/** The cover as stored; the name of a built-in picture is checked by whoever draws it. */
export function parseCover(raw: unknown): ImageRef | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { builtin, key } = raw as Record<string, unknown>;
  if (typeof builtin === "string" && /^[a-z]{1,20}$/.test(builtin) && key === undefined) return { builtin } as ImageRef;
  if (typeof key === "string" && IMAGE_KEY.test(key) && builtin === undefined) return { key };
  return null;
}

export async function fetchPublishedRoom(api: Api, id: string): Promise<PublishedRoom | null> {
  const rows = await api.rest<Row[]>("rooms", {
    query: { id: `eq.${id}`, select: `id,author_id,doc,title,description,play_count,published_at,hidden,${AUTHOR}` },
  });
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    doc: row.doc,
    title: row.title,
    description: row.description,
    author: row.author?.username ?? null,
    authorId: row.author_id,
    playCount: row.play_count,
    publishedAt: row.published_at,
    hidden: row.hidden,
  };
}

// --- Gallery ---

const SORT_COLUMN: Partial<Record<GallerySort, "published_at" | "play_count">> = { new: "published_at", plays: "play_count" };

/** PostgREST query parameters for one page of rooms; sorts other than "new" and "plays" fall back to "new". */
export function roomGalleryQuery(
  filter: { sort: GallerySort; lang: PuzzleLang | null; q: string | null },
  cursor: GalleryCursor | null,
  limit: number,
): Record<string, string> {
  const column = SORT_COLUMN[filter.sort] ?? "published_at";
  const query: Record<string, string> = {
    select: `id,title,content_key,cover,scene_count,puzzle_count,lang,play_count,published_at,${AUTHOR}`,
    hidden: "is.false", // authors would otherwise see their own hidden rooms here
    order: `${column}.desc,id.desc`,
    limit: String(limit),
  };
  if (filter.lang) query.lang = `eq.${filter.lang}`;
  if (filter.q) query.and = searchCondition(filter.q);
  if (cursor) query.or = afterCursor(column, cursor);
  return query;
}

export async function fetchRoomPage(
  api: Api,
  filter: { sort: GallerySort; lang: PuzzleLang | null; q: string | null },
  cursor: GalleryCursor | null,
  pageSize = PAGE_SIZE,
): Promise<{ items: RoomItem[]; next: GalleryCursor | null }> {
  const rows = await api.rest<Row[]>("rooms", { query: roomGalleryQuery(filter, cursor, pageSize + 1) });
  const page = rows.slice(0, pageSize);
  const last = page.at(-1);
  const column = SORT_COLUMN[filter.sort] ?? "published_at";
  const next = rows.length > pageSize && last ? { value: last[column], id: last.id } : null;
  const items = page.map((row) => ({
    id: row.id,
    title: row.title,
    author: row.author?.username ?? null,
    contentKey: row.content_key,
    cover: parseCover(row.cover),
    sceneCount: row.scene_count,
    puzzleCount: row.puzzle_count,
    lang: isPuzzleLang(row.lang) ? row.lang : null,
    playCount: row.play_count,
    publishedAt: row.published_at,
  }));
  return { items, next };
}

// --- Own rooms ---

export async function listOwnRooms(api: Api, userId: string): Promise<OwnRoom[]> {
  const rows = await api.rest<Row[]>("rooms", {
    query: { author_id: `eq.${userId}`, select: "id,title,description,scene_count,play_count,published_at,hidden", order: "published_at.desc" },
  });
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    sceneCount: row.scene_count,
    playCount: row.play_count,
    publishedAt: row.published_at,
    hidden: row.hidden,
  }));
}

/** Content keys of the user's own visible rooms: "In der Galerie" in the library. */
export async function ownPublishedRoomKeys(api: Api, userId: string): Promise<Set<string>> {
  const rows = await api.rest<{ content_key: unknown }[]>("rooms", {
    query: { author_id: `eq.${userId}`, hidden: "is.false", select: "content_key" },
  });
  return new Set(rows.map((row) => row.content_key).filter((key): key is string => typeof key === "string"));
}

export async function updateRoomPublication(api: Api, id: string, change: { title: string; description: string }): Promise<void> {
  await api.rest("rooms", { method: "PATCH", query: { id: `eq.${id}` }, body: change, headers: { Prefer: "return=minimal" } });
}

/** Withdrawing deletes the room; its pictures are removed by the daily cleanup. */
export async function withdrawRoom(api: Api, id: string): Promise<void> {
  await api.rest("rooms", { method: "DELETE", query: { id: `eq.${id}` }, headers: { Prefer: "return=minimal" } });
}

/** Counts a play; like registerPlay, once per device. */
export async function registerRoomPlay(api: Api, id: string): Promise<void> {
  await api.rest("rpc/register_room_play", { body: { room: id } });
}

/** `images`: base64 bytes by key, for every own picture the room uses. Returns the new id. */
export async function publishRoom(
  api: Api,
  request: { doc: unknown; title: string; description: string; images: Record<string, string> },
): Promise<string> {
  return (await api.functions<{ id: string }>("publish", { body: request })).id;
}

/** The id of a visible published room with this content, if there is one. */
export async function findRoomByContentKey(api: Api, contentKey: string): Promise<string | null> {
  const rows = await api.rest<{ id: string }[]>("rooms", { query: { content_key: `eq.${contentKey}`, select: "id" } });
  return rows[0]?.id ?? null;
}

// --- Reports and moderation ---

/** Reports a room once; a second report by the same user fails with a unique violation (kind "conflict"). */
export async function reportRoom(api: Api, userId: string, roomId: string, reason: ReportReason, comment: string): Promise<void> {
  await api.rest("reports", {
    body: { room_id: roomId, reporter_id: userId, reason, comment: comment.trim().slice(0, REPORT_COMMENT_MAX) },
    headers: { Prefer: "return=minimal" },
  });
}

export async function hasReportedRoom(api: Api, userId: string, roomId: string): Promise<boolean> {
  const rows = await api.rest<unknown[]>("reports", { query: { reporter_id: `eq.${userId}`, room_id: `eq.${roomId}`, select: "id" } });
  return rows.length > 0;
}

export async function releaseRoom(api: Api, roomId: string): Promise<void> {
  await api.rest("rpc/mod_release_room", { body: { room: roomId } });
}

export async function hideRoom(api: Api, roomId: string): Promise<void> {
  await api.rest("rpc/mod_hide_room", { body: { room: roomId } });
}

/** A user-facing text for errors of the publish function with an escape room (codes from src/server/publish-handler.ts). */
export function roomPublishErrorText(error: unknown): MessageKey {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "not-verified":
        return error.message !== error.code ? "roomPublishPuzzleNotVerified" : "roomPublishNotVerified";
      case "unsolvable":
        return "roomPublishPuzzleUnsolvable";
      case "theme-contrast":
        return "roomPublishPuzzleContrast";
      case "unwinnable":
        return "roomPublishUnwinnable";
      case "invalid-title":
        return "publishInvalidTitle";
      case "invalid-description":
        return "publishInvalidDescription";
      case "too-large":
        return "roomPublishTooLarge";
      case "invalid-document":
      case "invalid-request":
        return "roomPublishInvalid";
      case "daily-limit":
        return "roomPublishDailyLimit";
      case "banned":
        return "publishBanned";
      case "duplicate":
        return "roomPublishDuplicate";
      case "invalid-image":
        return "publishImageInvalid";
      case "upload":
        return "publishUploadFailed";
    }
  }
  return apiErrorText(error);
}

/** The embedded puzzle an error is about (its id in the room), if the server named one. */
export function roomPublishErrorPuzzle(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.code === undefined || error.message === error.code) return null;
  return ["not-verified", "unsolvable", "theme-contrast"].includes(error.code) ? error.message : null;
}
