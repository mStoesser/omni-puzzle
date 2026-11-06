import type { PuzzleType } from "./types.ts";

/** Play state managed by the core: move history for undo/redo, move count and solved flag. */
export type PlaySession<D, S, M> = {
  readonly type: PuzzleType<D, S, M>;
  readonly data: D;
  readonly history: readonly S[];
  readonly index: number; // position of the current state in history
  /** moves[i] leads from history[i] to history[i + 1]; sent to the server for leaderboards (see path). */
  readonly moves: readonly M[];
  readonly solved: boolean;
};

export type AnyPlaySession = PlaySession<unknown, unknown, unknown>;

export function createSession<D, S, M>(type: PuzzleType<D, S, M>, data: D): PlaySession<D, S, M> {
  const initial = type.initState(data);
  return { type, data, history: [initial], moves: [], index: 0, solved: type.isSolved(data, initial) };
}

export function currentState<D, S, M>(session: PlaySession<D, S, M>): S {
  return session.history[session.index]!;
}

export function moveCount(session: PlaySession<unknown, unknown, unknown>): number {
  return session.index;
}

/** The moves from the initial to the current state, without undone ones. */
export function path<M>(session: PlaySession<unknown, unknown, M>): M[] {
  return session.moves.slice(0, session.index);
}

export function canUndo(session: PlaySession<unknown, unknown, unknown>): boolean {
  return session.index > 0;
}

export function canRedo(session: PlaySession<unknown, unknown, unknown>): boolean {
  return session.index < session.history.length - 1;
}

/** Applies a move. Returns the same session if the move is invalid or the puzzle is already solved. */
export function dispatch<D, S, M>(session: PlaySession<D, S, M>, move: M): PlaySession<D, S, M> {
  if (session.solved) return session;
  const next = session.type.applyMove(session.data, currentState(session), move);
  if (next === null) return session;
  const history = [...session.history.slice(0, session.index + 1), next];
  const moves = [...session.moves.slice(0, session.index), move];
  return goTo({ ...session, history, moves }, history.length - 1);
}

export function undo<D, S, M>(session: PlaySession<D, S, M>): PlaySession<D, S, M> {
  return canUndo(session) ? goTo(session, session.index - 1) : session;
}

export function redo<D, S, M>(session: PlaySession<D, S, M>): PlaySession<D, S, M> {
  return canRedo(session) ? goTo(session, session.index + 1) : session;
}

export function restart<D, S, M>(session: PlaySession<D, S, M>): PlaySession<D, S, M> {
  if (session.history.length === 1) return session;
  return goTo({ ...session, history: [session.history[0]!], moves: [] }, 0);
}

function goTo<D, S, M>(session: PlaySession<D, S, M>, index: number): PlaySession<D, S, M> {
  const state = session.history[index]!;
  return { ...session, index, solved: session.type.isSolved(session.data, state) };
}
