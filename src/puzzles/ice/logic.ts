import { DELTA, DIRS, isDir, pointKey } from "../../core/grid.ts";
import type { Dir, Point } from "../../core/grid.ts";

// Ice sliding: the figure slides in a direction until a rock or the board edge stops it.
// Sand stops it on the sand cell itself. Solved when the figure comes to rest on a goal.

export type IceKind = "wall" | "sand" | "goal" | "start";

export type IceCell = { x: number; y: number; kind: IceKind };

export type IceData = {
  width: number;
  height: number;
  cells: IceCell[]; // empty ice is not listed; sorted by row, then column
};

/** Position of the figure. Off the board (-1, -1) only for editor drafts without a start. */
export type IceState = { x: number; y: number };

/** A move is the direction of one slide. */
export type IceMove = Dir;

export const LIMITS = { minSize: 3, maxSize: 14 } as const;

export type ProblemCode = "out-of-bounds" | "duplicate-cell" | "no-start" | "multiple-starts" | "no-goal";

export type Problem = { code: ProblemCode; cell?: number };

export function createDefault(): IceData {
  return {
    width: 7,
    height: 7,
    // Down to the rock, then right onto the goal: 2 slides. The sand is there to show what it looks like.
    cells: [
      { x: 0, y: 0, kind: "start" },
      { x: 3, y: 2, kind: "sand" },
      { x: 5, y: 4, kind: "goal" },
      { x: 6, y: 4, kind: "wall" },
      { x: 0, y: 5, kind: "wall" },
    ],
  };
}

export function findProblems(data: IceData): Problem[] {
  const problems: Problem[] = [];
  const seen = new Set<string>();
  data.cells.forEach(({ x, y }, i) => {
    if (x < 0 || y < 0 || x >= data.width || y >= data.height) problems.push({ code: "out-of-bounds", cell: i });
    const key = pointKey({ x, y });
    if (seen.has(key)) problems.push({ code: "duplicate-cell", cell: i });
    seen.add(key);
  });
  const starts = data.cells.flatMap((c, i) => (c.kind === "start" ? [i] : []));
  if (starts.length === 0) problems.push({ code: "no-start" });
  if (starts.length > 1) for (const cell of starts) problems.push({ code: "multiple-starts", cell });
  if (!data.cells.some((c) => c.kind === "goal")) problems.push({ code: "no-goal" });
  return problems;
}

/** Validates untrusted data and returns a clean copy. Throws on any problem. */
export function validate(raw: unknown): IceData {
  const data = parseDraft(raw);
  const problems = findProblems(data);
  if (problems.length > 0) throw new Error(`invalid puzzle: ${problems.map((p) => p.code).join(", ")}`);
  return data;
}

const KINDS: readonly IceKind[] = ["wall", "sand", "goal", "start"];

/** Checks only the structure and returns a clean copy; editor drafts may still have problems. */
export function parseDraft(raw: unknown): IceData {
  if (!isRecord(raw)) throw new Error("data is not an object");
  const width = intIn(raw.width, LIMITS.minSize, LIMITS.maxSize, "width");
  const height = intIn(raw.height, LIMITS.minSize, LIMITS.maxSize, "height");
  if (!Array.isArray(raw.cells) || raw.cells.length > LIMITS.maxSize * LIMITS.maxSize) throw new Error("cells");
  const cells = raw.cells.map((c: unknown): IceCell => {
    if (!isRecord(c)) throw new Error("cell is not an object");
    if (!KINDS.includes(c.kind as IceKind)) throw new Error("cell kind");
    return {
      x: intIn(c.x, 0, LIMITS.maxSize - 1, "cell x"),
      y: intIn(c.y, 0, LIMITS.maxSize - 1, "cell y"),
      kind: c.kind as IceKind,
    };
  });
  return { width, height, cells };
}

/** Index of the cell at (x, y) in data.cells, or -1. */
export function cellAt(data: IceData, x: number, y: number): number {
  return data.cells.findIndex((c) => c.x === x && c.y === y);
}

export function initState(data: IceData): IceState {
  const start = data.cells.find((c) => c.kind === "start");
  return start ? { x: start.x, y: start.y } : { x: -1, y: -1 };
}

// --- Sliding ---

const EMPTY = 0;
const WALL = 1;
const SAND = 2;
const GOAL = 3;

/** Prepared lookup for fast repeated slides (solver): one code per cell. Start counts as plain ice. */
export type Board = { width: number; height: number; grid: Uint8Array };

export function prepare(data: IceData): Board {
  const grid = new Uint8Array(data.width * data.height);
  for (const { x, y, kind } of data.cells) {
    if (x < 0 || y < 0 || x >= data.width || y >= data.height) continue;
    grid[y * data.width + x] = kind === "wall" ? WALL : kind === "sand" ? SAND : kind === "goal" ? GOAL : EMPTY;
  }
  return { width: data.width, height: data.height, grid };
}

/** Where the figure comes to rest when it slides from `from` in `dir`. Equal to `from` if it cannot move. */
export function slideOn(board: Board, from: Point, dir: Dir): Point {
  const [dx, dy] = DELTA[dir];
  let { x, y } = from;
  for (;;) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= board.width || ny >= board.height) break;
    const code = board.grid[ny * board.width + nx]!;
    if (code === WALL) break;
    x = nx;
    y = ny;
    if (code === SAND) break;
  }
  return { x, y };
}

export function slide(data: IceData, from: Point, dir: Dir): Point {
  return slideOn(prepare(data), from, dir);
}

/** Null if the figure cannot move in this direction (a rock or the edge right in front of it). */
export function applyMove(data: IceData, state: IceState, move: IceMove): IceState | null {
  if (!isDir(move) || !onBoard(data, state)) return null;
  const to = slide(data, state, move);
  return to.x === state.x && to.y === state.y ? null : to;
}

/** Solved when the figure rests on a goal; sliding over a goal does not count. */
export function isSolved(data: IceData, state: IceState): boolean {
  return data.cells.some((c) => c.kind === "goal" && c.x === state.x && c.y === state.y);
}

/** All moves possible from a position, with where each one ends (for the solver). */
export function nextPositions(board: Board, from: Point): [Dir, Point][] {
  const result: [Dir, Point][] = [];
  for (const dir of DIRS) {
    const to = slideOn(board, from, dir);
    if (to.x !== from.x || to.y !== from.y) result.push([dir, to]);
  }
  return result;
}

export function isGoal(board: Board, p: Point): boolean {
  return board.grid[p.y * board.width + p.x] === GOAL;
}

/**
 * Direction from the figure towards a tapped cell in the same row or column, or null
 * (same cell, or neither row nor column). Tapping such a cell slides the figure that way.
 */
export function dirTowards(from: Point, to: Point): Dir | null {
  if (from.x === to.x && from.y !== to.y) return to.y < from.y ? "N" : "S";
  if (from.y === to.y && from.x !== to.x) return to.x < from.x ? "W" : "E";
  return null;
}

function onBoard(data: IceData, p: Point): boolean {
  return p.x >= 0 && p.y >= 0 && p.x < data.width && p.y < data.height;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function intIn(value: unknown, min: number, max: number, field: string): number {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    throw new Error(`${field} out of range`);
  }
  return value as number;
}
