import { ApiError, apiErrorText } from "./api.ts";
import type { Api } from "./api.ts";
import type { PublishRequest } from "./publish.ts";
import type { MessageKey } from "../i18n/t.ts";

/** A published puzzle as shown on #/g/<id>. `doc` is untrusted and goes through loadDocument. */
export type PublishedPuzzle = {
  id: string;
  doc: unknown;
  title: string;
  description: string;
  author: string | null; // null if the profile is gone
  authorId: string;
  playCount: number;
  likeCount: number;
  ratingSum: number;
  ratingCount: number;
  publishedAt: string;
  hidden: boolean; // only visible to its author and moderators
};

/** One of the user's own publications, for the account page. */
export type OwnPublication = {
  id: string;
  type: string;
  title: string;
  description: string;
  playCount: number;
  likeCount: number;
  publishedAt: string;
  hidden: boolean;
};

export const PUBLISHED_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Row = {
  id: string;
  author_id: string;
  doc: unknown;
  type: string;
  title: string;
  description: string;
  play_count: number;
  like_count: number;
  rating_sum: number;
  rating_count: number;
  published_at: string;
  hidden: boolean;
  author: { username: string } | null;
};

export async function fetchPublished(api: Api, id: string): Promise<PublishedPuzzle | null> {
  const rows = await api.rest<Row[]>("puzzles", {
    query: {
      id: `eq.${id}`,
      select:
        "id,author_id,doc,title,description,play_count,like_count,rating_sum,rating_count,published_at,hidden," +
        "author:profiles!puzzles_author_id_fkey(username)",
    },
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
    likeCount: row.like_count,
    ratingSum: row.rating_sum,
    ratingCount: row.rating_count,
    publishedAt: row.published_at,
    hidden: row.hidden,
  };
}

export async function listOwnPublications(api: Api, userId: string): Promise<OwnPublication[]> {
  const rows = await api.rest<Row[]>("puzzles", {
    query: {
      author_id: `eq.${userId}`,
      select: "id,type,title,description,play_count,like_count,published_at,hidden",
      order: "published_at.desc",
    },
  });
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description,
    playCount: row.play_count,
    likeCount: row.like_count,
    publishedAt: row.published_at,
    hidden: row.hidden,
  }));
}

/** Publishes via the Edge Function, which checks the puzzle itself. Returns the new id. */
export async function publishPuzzle(api: Api, request: PublishRequest): Promise<string> {
  return (await api.functions<{ id: string }>("publish", { body: request })).id;
}

/** The id of a puzzle with this content (progressKey), if it is published and visible. */
export async function findByContentKey(api: Api, contentKey: string): Promise<string | null> {
  const rows = await api.rest<{ id: string }[]>("puzzles", { query: { content_key: `eq.${contentKey}`, select: "id" } });
  return rows[0]?.id ?? null;
}

export async function updatePublication(api: Api, id: string, change: { title: string; description: string }): Promise<void> {
  await api.rest("puzzles", {
    method: "PATCH",
    query: { id: `eq.${id}` },
    body: change,
    headers: { Prefer: "return=minimal" },
  });
}

export async function withdrawPublication(api: Api, id: string): Promise<void> {
  await api.rest("puzzles", { method: "DELETE", query: { id: `eq.${id}` }, headers: { Prefer: "return=minimal" } });
}

/** Counts a play; deliberately simple and not tamper-proof (the app calls it once per device). */
export async function registerPlay(api: Api, id: string): Promise<void> {
  await api.rest("rpc/register_play", { body: { puzzle: id } });
}

/** A user-facing text for errors of the publish function (codes from src/server/publish-handler.ts). */
export function publishErrorText(error: unknown): MessageKey {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "not-verified":
        return "publishNotVerified";
      case "unsolvable":
        return "publishUnsolvable";
      case "invalid-title":
        return "publishInvalidTitle";
      case "invalid-description":
        return "publishInvalidDescription";
      case "too-large":
        return "publishTooLarge";
      case "invalid-document":
      case "invalid-request":
        return "publishInvalid";
      case "daily-limit":
        return "publishDailyLimit";
      case "banned":
        return "publishBanned";
      case "duplicate":
        return "publishDuplicate";
      case "invalid-image":
        return "publishImageInvalid";
      case "upload":
        return "publishUploadFailed";
    }
  }
  return apiErrorText(error);
}
