import type { Registry } from "./registry.ts";
import type { AnyPuzzleRules, PuzzleDocument, PuzzleMeta } from "./types.ts";

export type DocumentErrorCode =
  | "invalid" // malformed or failed validation
  | "too-large" // exceeds size limits
  | "unsupported" // newer format or codec than this app understands
  | "unknown-type"; // puzzle type is not registered

export class DocumentError extends Error {
  readonly code: DocumentErrorCode;

  constructor(code: DocumentErrorCode, message?: string) {
    super(message ?? code);
    this.name = "DocumentError";
    this.code = code;
  }
}

const LIMITS = { title: 200, author: 100, description: 2000, createdAt: 40 } as const;
const TYPE_ID = /^[a-z0-9-]{1,32}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown, maxLength: number, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length > maxLength) {
    throw new DocumentError("invalid", `meta.${field}`);
  }
  return value;
}

/**
 * Checks the envelope of an untrusted document and returns a clean copy
 * without unknown fields. `data` is passed through; the puzzle type validates it.
 */
export function validateEnvelope(raw: unknown): PuzzleDocument {
  if (!isRecord(raw)) throw new DocumentError("invalid", "not an object");
  if (raw.format !== 1) {
    throw new DocumentError(typeof raw.format === "number" ? "unsupported" : "invalid", "format");
  }
  if (typeof raw.type !== "string" || !TYPE_ID.test(raw.type)) throw new DocumentError("invalid", "type");
  if (!Number.isInteger(raw.typeVersion) || (raw.typeVersion as number) < 1) {
    throw new DocumentError("invalid", "typeVersion");
  }
  if (!("data" in raw) || raw.data === undefined) throw new DocumentError("invalid", "data");

  const meta = raw.meta;
  if (!isRecord(meta)) throw new DocumentError("invalid", "meta");
  const title = optionalString(meta.title, LIMITS.title, "title");
  const createdAt = optionalString(meta.createdAt, LIMITS.createdAt, "createdAt");
  if (title === undefined || createdAt === undefined) throw new DocumentError("invalid", "meta");

  const clean: PuzzleMeta = { title, createdAt };
  const author = optionalString(meta.author, LIMITS.author, "author");
  const description = optionalString(meta.description, LIMITS.description, "description");
  if (author !== undefined) clean.author = author;
  if (description !== undefined) clean.description = description;
  if (meta.verified !== undefined) {
    if (typeof meta.verified !== "boolean") throw new DocumentError("invalid", "meta.verified");
    clean.verified = meta.verified;
  }
  if (meta.minMoves !== undefined) {
    if (!Number.isInteger(meta.minMoves) || (meta.minMoves as number) < 0) {
      throw new DocumentError("invalid", "meta.minMoves");
    }
    clean.minMoves = meta.minMoves as number;
  }

  return { format: 1, type: raw.type, typeVersion: raw.typeVersion as number, meta: clean, data: raw.data };
}

/**
 * Turns an untrusted document into a playable one:
 * envelope check → type lookup → migrate (if older) → type validation.
 * With `draft`, the data only needs a valid structure (parseDraft), for editor drafts.
 */
export function loadDocument<T extends AnyPuzzleRules>(
  raw: unknown,
  registry: Registry<T>,
  options: { draft?: boolean } = {},
): { type: T; doc: PuzzleDocument } {
  const doc = validateEnvelope(raw);
  const type = registry.get(doc.type);
  if (!type) throw new DocumentError("unknown-type", doc.type);
  if (doc.typeVersion > type.version) throw new DocumentError("unsupported", "typeVersion");

  let data = doc.data;
  if (doc.typeVersion < type.version) {
    if (!type.migrate) throw new DocumentError("unsupported", "no migration");
    try {
      data = type.migrate(data, doc.typeVersion);
    } catch (error) {
      throw new DocumentError("invalid", `migration failed: ${String(error)}`);
    }
  }

  try {
    data = options.draft && type.parseDraft ? type.parseDraft(data) : type.validate(data);
  } catch (error) {
    throw new DocumentError("invalid", `validation failed: ${String(error)}`);
  }
  return { type, doc: { ...doc, typeVersion: type.version, data } };
}

/**
 * The document as it leaves the device (share link, publishing): the checked document from `loadDocument`.
 * `validate` returns only what is needed to play, so editor-only fields that `parseDraft` keeps in drafts
 * (e.g. the picture behind a nonogram's clues) are dropped. Progress keys use the same checked data.
 * Throws a DocumentError for documents that are not playable.
 */
export function shareableDocument<T extends AnyPuzzleRules>(doc: unknown, registry: Registry<T>): PuzzleDocument {
  return loadDocument(doc, registry).doc;
}
