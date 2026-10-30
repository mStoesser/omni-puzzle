import { DELTA, isDir, pointKey } from "../../core/grid.ts";
import type { Dir, Point } from "../../core/grid.ts";

export type Orientation = "/" | "\\";

export type LaserCell =
  | { kind: "wall" }
  | { kind: "emitter"; dir: Dir }
  | { kind: "target" }
  | { kind: "mirror"; orientation: Orientation; rotatable: boolean };

export type PlacedCell = { x: number; y: number; cell: LaserCell };

export type LaserData = {
  width: number;
  height: number;
  cells: PlacedCell[]; // empty cells are not listed
};

/** Current orientation of every rotatable mirror, keyed by pointKey ("x,y"). */
export type LaserState = { orientations: Readonly<Record<string, Orientation>> };

/** Flips the rotatable mirror at (x, y). */
export type LaserMove = { x: number; y: number };

export const LIMITS = { minSize: 3, maxSize: 12 } as const;

export type ProblemCode = "out-of-bounds" | "duplicate-cell" | "no-emitter" | "no-target";

export type Problem = { code: ProblemCode; cell?: number };

// Travel direction before → after the mirror. "/" runs from bottom left to top right.
const REFLECT: Record<Orientation, Record<Dir, Dir>> = {
  "/": { N: "E", E: "N", S: "W", W: "S" },
  "\\": { N: "W", W: "N", S: "E", E: "S" },
};

export function reflect(dir: Dir, orientation: Orientation): Dir {
  return REFLECT[orientation][dir];
}

export function flip(orientation: Orientation): Orientation {
  return orientation === "/" ? "\\" : "/";
}

export function createDefault(): LaserData {
  return {
    width: 6,
    height: 6,
    cells: [
      { x: 0, y: 1, cell: { kind: "emitter", dir: "E" } },
      { x: 4, y: 1, cell: { kind: "mirror", orientation: "/", rotatable: true } },
      { x: 4, y: 4, cell: { kind: "target" } },
    ],
  };
}

export function findProblems(data: LaserData): Problem[] {
  const problems: Problem[] = [];
  const seen = new Set<string>();
  data.cells.forEach(({ x, y }, i) => {
    if (x < 0 || y < 0 || x >= data.width || y >= data.height) problems.push({ code: "out-of-bounds", cell: i });
    const key = pointKey({ x, y });
    if (seen.has(key)) problems.push({ code: "duplicate-cell", cell: i });
    seen.add(key);
  });
  if (!data.cells.some((c) => c.cell.kind === "emitter")) problems.push({ code: "no-emitter" });
  if (!data.cells.some((c) => c.cell.kind === "target")) problems.push({ code: "no-target" });
  return problems;
}

/** Validates untrusted data and returns a clean copy. Throws on any problem. */
export function validate(raw: unknown): LaserData {
  const data = parseDraft(raw);
  const problems = findProblems(data);
  if (problems.length > 0) throw new Error(`invalid puzzle: ${problems.map((p) => p.code).join(", ")}`);
  return data;
}

/** Checks only the structure and returns a clean copy; editor drafts may still have problems. */
export function parseDraft(raw: unknown): LaserData {
  if (!isRecord(raw)) throw new Error("data is not an object");
  const width = intIn(raw.width, LIMITS.minSize, LIMITS.maxSize, "width");
  const height = intIn(raw.height, LIMITS.minSize, LIMITS.maxSize, "height");
  if (!Array.isArray(raw.cells) || raw.cells.length > LIMITS.maxSize * LIMITS.maxSize) throw new Error("cells");
  const cells = raw.cells.map((c: unknown): PlacedCell => {
    if (!isRecord(c)) throw new Error("cell is not an object");
    return {
      x: intIn(c.x, 0, LIMITS.maxSize - 1, "cell x"),
      y: intIn(c.y, 0, LIMITS.maxSize - 1, "cell y"),
      cell: parseCell(c.cell),
    };
  });
  return { width, height, cells };
}

function parseCell(raw: unknown): LaserCell {
  if (!isRecord(raw)) throw new Error("cell content");
  switch (raw.kind) {
    case "wall":
      return { kind: "wall" };
    case "target":
      return { kind: "target" };
    case "emitter":
      if (!isDir(raw.dir)) throw new Error("emitter dir");
      return { kind: "emitter", dir: raw.dir };
    case "mirror":
      if (raw.orientation !== "/" && raw.orientation !== "\\") throw new Error("mirror orientation");
      if (typeof raw.rotatable !== "boolean") throw new Error("mirror rotatable");
      return { kind: "mirror", orientation: raw.orientation, rotatable: raw.rotatable };
    default:
      throw new Error("cell kind");
  }
}

export function initState(data: LaserData): LaserState {
  const orientations: Record<string, Orientation> = {};
  for (const { x, y, cell } of data.cells) {
    if (cell.kind === "mirror" && cell.rotatable) orientations[pointKey({ x, y })] = cell.orientation;
  }
  return { orientations };
}

/** Index of the cell at (x, y) in data.cells, or -1. */
export function cellAt(data: LaserData, x: number, y: number): number {
  return data.cells.findIndex((c) => c.x === x && c.y === y);
}

export function applyMove(data: LaserData, state: LaserState, move: LaserMove): LaserState | null {
  const key = pointKey(move);
  const current = state.orientations[key];
  if (current === undefined) return null;
  return { orientations: { ...state.orientations, [key]: flip(current) } };
}

// --- Beam tracing ---

/** A beam as a polyline in cell units (cell centers are at x + 0.5). */
export type Beam = {
  points: Point[];
  end: "edge" | "blocked" | "loop"; // left the board, hit a wall/emitter, or runs in a loop
};

export type Trace = { beams: Beam[]; hit: ReadonlySet<string> }; // hit = pointKeys of lit targets

/** Prepared lookup for fast repeated tracing (solver). */
export type Board = { data: LaserData; grid: Int16Array }; // grid: cell index or -1

export function prepare(data: LaserData): Board {
  const grid = new Int16Array(data.width * data.height).fill(-1);
  data.cells.forEach(({ x, y }, i) => {
    if (x >= 0 && y >= 0 && x < data.width && y < data.height && grid[y * data.width + x] === -1) {
      grid[y * data.width + x] = i;
    }
  });
  return { data, grid };
}

/** Follows every emitter's beam. `orientation(i)` gives the current orientation of mirror cell i. */
export function traceBoard(board: Board, orientation: (index: number) => Orientation): Trace {
  const { data, grid } = board;
  const beams: Beam[] = [];
  const hit = new Set<string>();
  for (const emitter of data.cells) {
    if (emitter.cell.kind !== "emitter") continue;
    let { x, y } = emitter;
    let dir = emitter.cell.dir;
    const points: Point[] = [{ x: x + 0.5, y: y + 0.5 }];
    const visited = new Set<number>(); // (cell, dir) pairs
    let end: Beam["end"];
    for (;;) {
      const [dx, dy] = DELTA[dir];
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= data.width || ny >= data.height) {
        end = "edge";
        break;
      }
      const index = grid[ny * data.width + nx]!;
      const content = index >= 0 ? data.cells[index]!.cell : null;
      if (content?.kind === "wall" || content?.kind === "emitter") {
        end = "blocked";
        break;
      }
      x = nx;
      y = ny;
      const state = ((y * data.width + x) << 2) | "NESW".indexOf(dir);
      if (visited.has(state)) {
        end = "loop";
        break;
      }
      visited.add(state);
      if (content?.kind === "target") hit.add(pointKey({ x, y }));
      if (content?.kind === "mirror") {
        dir = reflect(dir, orientation(index));
        points.push({ x: x + 0.5, y: y + 0.5 });
      }
    }
    if (end === "loop") {
      points.push({ x: x + 0.5, y: y + 0.5 });
    } else {
      // Stop at the border of the current cell, facing the obstacle or the edge.
      const [dx, dy] = DELTA[dir];
      points.push({ x: x + 0.5 + dx / 2, y: y + 0.5 + dy / 2 });
    }
    beams.push({ points, end });
  }
  return { beams, hit };
}

export function traceBeams(data: LaserData, state: LaserState): Trace {
  return traceBoard(prepare(data), (i) => mirrorOrientation(data, state, i));
}

function mirrorOrientation(data: LaserData, state: LaserState, index: number): Orientation {
  const { x, y, cell } = data.cells[index]!;
  if (cell.kind !== "mirror") throw new Error("not a mirror");
  return state.orientations[pointKey({ x, y })] ?? cell.orientation;
}

export function targetCount(data: LaserData): number {
  return data.cells.filter((c) => c.cell.kind === "target").length;
}

/** Solved when every target is hit by a beam. */
export function isSolved(data: LaserData, state: LaserState): boolean {
  const targets = targetCount(data);
  return targets > 0 && traceBeams(data, state).hit.size === targets;
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
