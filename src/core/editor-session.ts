import type { PuzzleDocument, PuzzleMeta, SolveResult } from "./types.ts";

/** Editor state managed by the core: title and data history for undo/redo. */
export type EditorSession<D> = {
  readonly title: string;
  readonly history: readonly D[];
  readonly index: number;
};

export const MAX_EDITOR_HISTORY = 200;

export function createEditorSession<D>(data: D, title: string): EditorSession<D> {
  return { title, history: [data], index: 0 };
}

export function currentData<D>(session: EditorSession<D>): D {
  return session.history[session.index]!;
}

/** Records a new version. Passing the current data (same reference) is a no-op. */
export function updateData<D>(session: EditorSession<D>, data: D): EditorSession<D> {
  if (Object.is(data, currentData(session))) return session;
  const history = [...session.history.slice(0, session.index + 1), data].slice(-MAX_EDITOR_HISTORY);
  return { ...session, history, index: history.length - 1 };
}

export function setTitle<D>(session: EditorSession<D>, title: string): EditorSession<D> {
  return title === session.title ? session : { ...session, title };
}

export function canUndoEdit(session: EditorSession<unknown>): boolean {
  return session.index > 0;
}

export function canRedoEdit(session: EditorSession<unknown>): boolean {
  return session.index < session.history.length - 1;
}

export function undoEdit<D>(session: EditorSession<D>): EditorSession<D> {
  return canUndoEdit(session) ? { ...session, index: session.index - 1 } : session;
}

export function redoEdit<D>(session: EditorSession<D>): EditorSession<D> {
  return canRedoEdit(session) ? { ...session, index: session.index + 1 } : session;
}

export type EditorCheck = {
  problems: readonly string[];
  hasSolver: boolean;
  solve: SolveResult<unknown> | null; // null = not checked yet
  verified: boolean; // solved by the creator in test play
};

/**
 * Test play needs a problem-free puzzle. Sharing additionally needs the creator to have solved it
 * and, if the type has a solver, a check that did not prove it unsolvable.
 */
export function readiness(check: EditorCheck): { canTest: boolean; canShare: boolean } {
  const canTest = check.problems.length === 0;
  const solverOk = !check.hasSolver || (check.solve !== null && check.solve.status !== "unsolvable");
  return { canTest, canShare: canTest && check.verified && solverOk };
}

/** The document for saving or sharing the current editor state. */
export function toDocument<D>(
  session: EditorSession<D>,
  info: { type: string; typeVersion: number; createdAt: string; verified: boolean; solve: SolveResult<unknown> | null },
): PuzzleDocument<D> {
  const meta: PuzzleMeta = { title: session.title, createdAt: info.createdAt };
  if (info.verified) meta.verified = true;
  if (info.solve?.status === "solved") meta.minMoves = info.solve.moves.length;
  return { format: 1, type: info.type, typeVersion: info.typeVersion, meta, data: currentData(session) };
}
