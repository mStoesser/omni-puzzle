// Previews on the cards (M32): the starting position of a puzzle, drawn by its type's renderPreview.
// Pure: decides which data a preview may draw. The data comes from the server (preview_data in
// supabase/migrations/0014_preview.sql) or from the library, so it goes through loadDocument like any document.

import type { Api } from "./api.ts";
import { loadDocument } from "./document.ts";
import { PUBLISHED_ID } from "./published.ts";
import { parseTheme } from "./puzzle-theme.ts";
import type { PuzzleTheme } from "./puzzle-theme.ts";
import type { AnyPuzzleRules } from "./types.ts";

/** What the server sends for a preview: the stored typeVersion and the data. Untrusted. */
export type PreviewSource = { typeVersion: unknown; data: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The preview field of a server row (`preview:preview_data`), or null (no preview for this puzzle). */
export function parsePreviewSource(value: unknown): PreviewSource | null {
  return isRecord(value) && "data" in value ? { typeVersion: value.typeVersion, data: value.data } : null;
}

// Per source object and type, so re-rendering a list does not validate every card again.
const cache = new WeakMap<object, { type: AnyPuzzleRules; data: unknown }>();

/**
 * The checked data to draw, or null if `type` cannot draw it: unknown or newer typeVersion, invalid data.
 * Older data is migrated. `draft` accepts editor drafts with problems (library).
 */
export function previewData(
  type: AnyPuzzleRules | undefined,
  source: PreviewSource | null | undefined,
  options: { draft?: boolean } = {},
): unknown | null {
  if (!type || !source) return null;
  const cached = cache.get(source);
  if (cached?.type === type) return cached.data;
  let data: unknown = null;
  try {
    const registry = { get: (id: string) => (id === type.id ? type : undefined), all: () => [type] };
    const envelope = { format: 1, type: type.id, typeVersion: source.typeVersion, meta: { title: "", createdAt: "" }, data: source.data };
    data = loadDocument(envelope, registry, options).doc.data;
  } catch {
    data = null;
  }
  cache.set(source, { type, data });
  return data;
}

/** Theme and preview of one published puzzle, for a card whose other data comes from elsewhere (puzzle of the day). */
export type CardPreview = { theme: PuzzleTheme | null; source: PreviewSource | null };

/** null if the puzzle is gone or hidden (or the id is not one). */
export async function fetchCardPreview(api: Api, id: string): Promise<CardPreview | null> {
  if (!PUBLISHED_ID.test(id)) return null;
  const rows = await api.rest<{ theme?: unknown; preview?: unknown }[]>("puzzles", {
    query: { id: `eq.${id}`, hidden: "is.false", select: "theme:doc->meta->theme,preview:preview_data" },
  });
  const row = rows[0];
  return row ? { theme: parseTheme(row.theme), source: parsePreviewSource(row.preview) } : null;
}
