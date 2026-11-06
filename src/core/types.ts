import type { SVGTemplateResult, TemplateResult } from "lit-html";
import type { MessageKey } from "../i18n/t.ts";

export type PuzzleMeta = {
  title: string;
  author?: string;
  description?: string;
  createdAt: string; // ISO date
  verified?: boolean; // solved by its creator
  minMoves?: number; // determined by the solver
};

/** Envelope shared by all puzzle types. */
export type PuzzleDocument<D = unknown> = {
  format: 1;
  type: string;
  typeVersion: number;
  meta: PuzzleMeta;
  data: D;
};

export type SolveLimits = { maxNodes: number };

export type SolveResult<M> =
  | { status: "solved"; moves: M[] }
  | { status: "unsolvable" }
  | { status: "aborted" }; // search limit reached

/**
 * Where the pictures of a puzzle come from: IndexedDB for own puzzles, Supabase Storage for published ones.
 * `url` returns "loading" while a local image is read, null if the image is not available (e.g. a share link).
 */
export type ImageSource = { url(key: string): string | "loading" | null };

export type PlayContext<D, S, M> = {
  data: D;
  state: S;
  /** The core applies the move, records history (undo/redo) and checks isSolved. */
  dispatch(move: M): void;
  images: ImageSource;
};

export type EditorContext<D> = {
  data: D;
  /**
   * The core records the editor's undo history. Changes with the same `group` (one paint stroke,
   * see GridEditorOptions.onPaint) become a single undo step.
   */
  update(next: D, group?: number): void;
  /** Local images plus `add`: scales, encodes and stores a picture, resolves to its key or rejects with a reason. */
  images: ImageSource & { add(file: Blob): Promise<string> };
};

/**
 * The DOM-free part of a puzzle type (its `rules.ts`). The publish function on the server uses only this,
 * so it must not import lit-html, the DOM or UI texts.
 */
export type PuzzleRules<D, S, M> = {
  id: string;
  version: number; // current typeVersion

  createDefault(): D;
  /**
   * Throws on invalid data. Data from links is untrusted. Returns only what is needed to play: editor-only
   * fields that parseDraft keeps are dropped here, so they never leave the device (see shareableDocument).
   */
  validate(data: unknown): D;
  migrate?(data: unknown, fromVersion: number): unknown;
  /**
   * The oldest typeVersion that can represent this (validated) data. loadDocument stamps the document with it, so a
   * version bump that leaves old data unchanged keeps its progressKey (and content_key in the gallery), and share links
   * of such puzzles still open in older app versions. Without it, documents get the current `version`.
   */
  minVersion?(data: D): number;
  /**
   * Like validate, but only checks the structure, so unfinished editor drafts can be loaded.
   * May keep editor-only fields (e.g. a nonogram's picture behind its clues). Throws on malformed data.
   * Without it, drafts must pass validate.
   */
  parseDraft?(data: unknown): D;
  initState(data: D): S;
  /** Returns null for an invalid move. Must not mutate `state`. */
  applyMove(data: D, state: S, move: M): S | null;
  isSolved(data: D, state: S): boolean;

  solve?(data: D, limits: SolveLimits): SolveResult<M>;
  /**
   * Difficulty from the solver's minimal move count: up to `easy` moves is easy, up to `medium` medium,
   * more is hard. Only for types with a solver; others get their difficulty from player ratings.
   */
  levels?: { easy: number; medium: number };
  /** Keys of the images the data references (see core/images.ts). Without it, the type has no images. */
  imageKeys?(data: D): string[];
};

/** Plugin interface every puzzle type implements: its rules plus texts and UI. D = data, S = play state, M = move. */
export type PuzzleType<D, S, M> = PuzzleRules<D, S, M> & {
  name: MessageKey;
  description: MessageKey; // one sentence for the home page
  /** Line symbol: paths for a 24×24 viewBox, drawn with stroke 2 and round ends in currentColor. */
  icon: SVGTemplateResult;
  /**
   * Type color for accents (icon tile, badge, progress bar), per theme. Pick a free hue with similar
   * brightness and saturation; yellow is the brand, green and red are status colors.
   */
  color: { dark: string; light: string };
  /** Which core play controls make sense for this type (default: all). E.g. a quiz has no undo and no move count. */
  controls?: { undo?: boolean; moves?: boolean };
  /** Localized, user-facing problems for live validation in the editor. Empty = playable. */
  problems?(data: D): string[];

  renderPlay(ctx: PlayContext<D, S, M>): TemplateResult;
  renderEditor(ctx: EditorContext<D>): TemplateResult;
};

/** A puzzle type of unknown concrete types, as stored in the registry. */
export type AnyPuzzleType = PuzzleType<unknown, unknown, unknown>;
export type AnyPuzzleRules = PuzzleRules<unknown, unknown, unknown>;
