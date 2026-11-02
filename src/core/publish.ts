import { levelFromMoves } from "./difficulty.ts";
import type { Level } from "./difficulty.ts";
import { DocumentError, loadDocument } from "./document.ts";
import type { Registry } from "./registry.ts";
import { progressKey } from "./storage.ts";
import type { AnyPuzzleRules, PuzzleDocument, PuzzleMeta } from "./types.ts";

// Shared by the app and the publish function on the server; DOM-free.
export const PUBLISH = {
  maxDocBytes: 131_072, // same limit as the check constraint on puzzles.doc
  maxTitle: 200,
  maxDescription: 2000,
  perDay: 10, // enforced by publish_puzzle() in supabase/migrations/0004_publish.sql
  // Lower than in the editor (200 000): Edge Functions get 2 s CPU per request, and 40 000 nodes take
  // about 0.7 s on a large 12×12 Rush Hour board. If the search stops there, minMoves stays unknown.
  solveLimits: { maxNodes: 40_000 },
} as const;

export type PublishErrorCode =
  | "invalid-request" // body is not { doc, title, description }
  | "invalid-title"
  | "invalid-description"
  | "too-large"
  | "invalid-document" // fails loadDocument (format, type, validation)
  | "not-verified" // the creator has not solved it
  | "unsolvable"; // the solver proved that there is no solution

export class PublishError extends Error {
  readonly code: PublishErrorCode;

  constructor(code: PublishErrorCode, message?: string) {
    super(message ?? code);
    this.name = "PublishError";
    this.code = code;
  }
}

export type PublishRequest = { doc: unknown; title: string; description: string };

/** A checked puzzle, ready for the puzzles table. */
export type Publication = {
  type: string;
  typeVersion: number;
  doc: PuzzleDocument;
  contentKey: string;
  title: string;
  description: string;
  minMoves: number | null; // null = no solver or the search limit was reached
  difficulty: Level | null; // from minMoves; null = unknown (ratings decide later)
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Checks an untrusted publish request like the editor does: valid document, solved by its creator,
 * and not unsolvable. With a solver, `minMoves` is computed here instead of trusting the client.
 */
export function preparePublication(input: unknown, registry: Registry<AnyPuzzleRules>): Publication {
  if (!isRecord(input) || !("doc" in input)) throw new PublishError("invalid-request");
  const { title, description = "" } = input;
  if (typeof title !== "string") throw new PublishError("invalid-request");
  const cleanTitle = title.trim();
  if (cleanTitle.length === 0 || cleanTitle.length > PUBLISH.maxTitle) throw new PublishError("invalid-title");
  if (typeof description !== "string" || description.trim().length > PUBLISH.maxDescription) {
    throw new PublishError("invalid-description");
  }
  if (new TextEncoder().encode(JSON.stringify(input.doc) ?? "").length > PUBLISH.maxDocBytes) {
    throw new PublishError("too-large");
  }

  let loaded: { type: AnyPuzzleRules; doc: PuzzleDocument };
  try {
    loaded = loadDocument(input.doc, registry);
  } catch (error) {
    if (error instanceof DocumentError) throw new PublishError("invalid-document", error.message);
    throw error;
  }
  const { type, doc } = loaded;
  if (doc.meta.verified !== true) throw new PublishError("not-verified");

  let minMoves: number | null = null;
  if (type.solve) {
    const result = type.solve(doc.data, PUBLISH.solveLimits);
    if (result.status === "unsolvable") throw new PublishError("unsolvable");
    if (result.status === "solved") minMoves = result.moves.length;
  }

  // Author and description are columns of their own; the document keeps only what describes the puzzle.
  const meta: PuzzleMeta = { title: cleanTitle, createdAt: doc.meta.createdAt, verified: true };
  if (minMoves !== null) meta.minMoves = minMoves;
  const published: PuzzleDocument = { format: 1, type: doc.type, typeVersion: doc.typeVersion, meta, data: doc.data };
  return {
    type: doc.type,
    typeVersion: doc.typeVersion,
    doc: published,
    contentKey: progressKey(published),
    title: cleanTitle,
    description: description.trim(),
    minMoves,
    difficulty: minMoves === null ? null : levelFromMoves(type, minMoves),
  };
}
