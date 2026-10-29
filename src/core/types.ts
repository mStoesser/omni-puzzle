import type { TemplateResult } from "lit-html";
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

export type PlayContext<D, S, M> = {
  data: D;
  state: S;
  /** The core applies the move, records history (undo/redo) and checks isSolved. */
  dispatch(move: M): void;
};

export type EditorContext<D> = {
  data: D;
  /** The core records the editor's undo history. */
  update(next: D): void;
};

/** Plugin interface every puzzle type implements. D = data, S = play state, M = move. */
export type PuzzleType<D, S, M> = {
  id: string;
  version: number; // current typeVersion
  name: MessageKey;
  icon: string;

  createDefault(): D;
  /** Throws on invalid data. Data from links is untrusted. */
  validate(data: unknown): D;
  migrate?(data: unknown, fromVersion: number): unknown;
  /**
   * Like validate, but only checks the structure, so unfinished editor drafts can be loaded.
   * Throws on malformed data. Without it, drafts must pass validate.
   */
  parseDraft?(data: unknown): D;
  /** Localized, user-facing problems for live validation in the editor. Empty = playable. */
  problems?(data: D): string[];

  initState(data: D): S;
  /** Returns null for an invalid move. Must not mutate `state`. */
  applyMove(data: D, state: S, move: M): S | null;
  isSolved(data: D, state: S): boolean;

  solve?(data: D, limits: SolveLimits): SolveResult<M>;

  renderPlay(ctx: PlayContext<D, S, M>): TemplateResult;
  renderEditor(ctx: EditorContext<D>): TemplateResult;
};

/** A puzzle type of unknown concrete types, as stored in the registry. */
export type AnyPuzzleType = PuzzleType<unknown, unknown, unknown>;
