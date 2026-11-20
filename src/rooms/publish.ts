// Escape rooms (M46): the checks before publishing, shared by the app and the publish function on the server; DOM-free.
// Like core/publish.ts for puzzles: the server trusts nothing the client says and recomputes what it stores.

import { DocumentError } from "../core/document.ts";
import { IMAGE_LIMITS, fromBase64, imageProblem, sniffImageType } from "../core/images.ts";
import { PUBLISH, PublishError } from "../core/publish.ts";
import type { UploadImage } from "../core/publish.ts";
import { contrastProblems } from "../core/puzzle-theme.ts";
import type { Registry } from "../core/registry.ts";
import type { AnyPuzzleRules, PuzzleLang } from "../core/types.ts";
import { checkEscapeRoom } from "./check.ts";
import { roomImageKeys } from "./edit.ts";
import { ROOM_LIMITS, loadEscapeRoom } from "./logic.ts";
import type { EscapeRoomDocument, EscapeRoomMeta, ImageRef } from "./logic.ts";
import { roomSaveKey } from "./save.ts";

export const ROOM_PUBLISH = {
  maxImages: 20, // own pictures per room (scenes, views and embedded quizzes); the rest uses the built-in ones
  perDay: 5, // enforced by publish_room() in supabase/migrations/0016_rooms.sql; ROOM_PER_DAY in published.ts
  // Edge Functions get 2 s CPU per request: the solvers of all embedded puzzles share this budget.
  solveNodes: 40_000,
  minSolveNodes: 2_000,
  maxRequestBytes: 2 * ROOM_LIMITS.maxDocBytes + Math.ceil((20 * IMAGE_LIMITS.maxBytes * 4) / 3) + 10_000,
} as const;

/** A checked escape room, ready for the rooms table. */
export type RoomPublication = {
  doc: EscapeRoomDocument;
  contentKey: string; // the hash of roomSaveKey: progress on this device carries over to the published room
  title: string;
  description: string;
  lang: PuzzleLang | null;
  cover: ImageRef; // the picture of the start scene, for the gallery card
  sceneCount: number;
  puzzleCount: number;
  minSteps: number | null; // fewest actions to win; null if only the reduced search could decide
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Whether a publish request is for an escape room (the publish function handles both). */
export function isRoomRequest(input: unknown): boolean {
  return isRecord(input) && isRecord(input.doc) && input.doc.kind === "escape-room";
}

/**
 * Checks an untrusted publish request for an escape room: valid and complete (not a draft), won by its creator, every
 * embedded puzzle solved by its creator, readable in its theme and not proven unsolvable, and the room winnable.
 * Errors about one embedded puzzle carry its id as message.
 */
export function prepareRoomPublication<T extends AnyPuzzleRules>(input: unknown, registry: Registry<T>): RoomPublication {
  if (!isRecord(input) || !("doc" in input)) throw new PublishError("invalid-request");
  const { title, description = "" } = input;
  if (typeof title !== "string") throw new PublishError("invalid-request");
  const cleanTitle = title.trim();
  if (cleanTitle.length === 0 || cleanTitle.length > PUBLISH.maxTitle) throw new PublishError("invalid-title");
  if (typeof description !== "string" || description.trim().length > PUBLISH.maxDescription) {
    throw new PublishError("invalid-description");
  }

  let doc: EscapeRoomDocument;
  try {
    doc = loadEscapeRoom(input.doc, registry);
  } catch (error) {
    if (error instanceof DocumentError) {
      throw new PublishError(error.code === "too-large" ? "too-large" : "invalid-document", error.message);
    }
    throw error;
  }
  if (doc.meta.verified !== true) throw new PublishError("not-verified");

  const solvers = doc.data.puzzles.filter((p) => registry.get(p.doc.type)?.solve).length;
  const maxNodes = Math.max(ROOM_PUBLISH.minSolveNodes, Math.floor(ROOM_PUBLISH.solveNodes / Math.max(1, solvers)));
  for (const puzzle of doc.data.puzzles) {
    const type = registry.get(puzzle.doc.type)!; // loadEscapeRoom checked the type
    if (puzzle.doc.meta.verified !== true) throw new PublishError("not-verified", puzzle.id);
    const theme = puzzle.doc.meta.theme;
    if (theme && type.themeRoles && contrastProblems(theme, { roles: type.themeRoles, fixed: type.themeFixed }).length > 0) {
      throw new PublishError("theme-contrast", puzzle.id);
    }
    if (type.solve && type.solve(puzzle.doc.data, { maxNodes }).status === "unsolvable") {
      throw new PublishError("unsolvable", puzzle.id);
    }
  }

  const check = checkEscapeRoom(doc.data);
  if (check.status !== "winnable") throw new PublishError("unwinnable");

  // Author and description are columns of their own, as for puzzles.
  const meta: EscapeRoomMeta = { title: cleanTitle, createdAt: doc.meta.createdAt, verified: true };
  if (doc.meta.lang) meta.lang = doc.meta.lang;
  const published: EscapeRoomDocument = { format: 1, kind: "escape-room", version: doc.version, meta, data: doc.data };
  const start = doc.data.scenes.find((s) => s.id === doc.data.start)!;
  return {
    doc: published,
    contentKey: roomSaveKey(published).slice("room:".length),
    title: cleanTitle,
    description: description.trim(),
    lang: doc.meta.lang ?? null,
    cover: start.image,
    sceneCount: doc.data.scenes.length,
    puzzleCount: doc.data.puzzles.length,
    minSteps: check.steps,
  };
}

/** The images a room must upload: every own picture it references, with checked bytes from the request. */
export function prepareRoomImages<T extends AnyPuzzleRules>(publication: RoomPublication, input: unknown, registry: Registry<T>): UploadImage[] {
  const keys = roomImageKeys(publication.doc.data, registry);
  if (keys.length > ROOM_PUBLISH.maxImages) throw new PublishError("invalid-image", "too many");
  const provided = isRecord(input) && isRecord(input.images) ? input.images : {};
  return keys.map((key) => {
    const encoded = provided[key];
    if (typeof encoded !== "string") throw new PublishError("invalid-image", `missing ${key}`);
    let bytes: Uint8Array;
    try {
      bytes = fromBase64(encoded);
    } catch {
      throw new PublishError("invalid-image", `base64 ${key}`);
    }
    const problem = imageProblem(key, bytes);
    if (problem) throw new PublishError("invalid-image", `${problem} ${key}`);
    return { key, type: sniffImageType(bytes)!, bytes };
  });
}
