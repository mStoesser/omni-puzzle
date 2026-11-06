import { isDir, pointKey } from "../../core/grid.ts";
import type { Dir, Point } from "../../core/grid.ts";

// Versions: 1 mirrors, walls, targets and red lasers; 2 adds the inventory (mirrors the player places);
// 3 adds beam splitters; 4 adds colors (green and blue lasers, targets that need a color, color filters).
// Every version can read the older data unchanged, and minVersion gives the oldest version that can show a puzzle.
export const VERSION = 4;

export type Orientation = "/" | "\\";

export type Color = "red" | "green" | "blue";

export const COLORS: readonly Color[] = ["red", "green", "blue"];

export type LaserCell =
  | { kind: "wall" }
  | { kind: "emitter"; dir: Dir; color?: Color } // without color: red (version 1 lasers)
  | { kind: "target"; color?: Color } // without color: any beam lights it
  | { kind: "mirror"; orientation: Orientation; rotatable: boolean }
  | { kind: "splitter"; orientation: Orientation; rotatable: boolean } // half mirror: the beam goes on and reflects
  | { kind: "filter"; color: Color }; // lets only beams of its color through

export type PlacedCell = { x: number; y: number; cell: LaserCell };

export type LaserData = {
  width: number;
  height: number;
  cells: PlacedCell[]; // empty cells are not listed
  /** Mirrors the player may place on empty cells, 1 to LIMITS.maxInventory. Missing = none (version 1 data). */
  inventory?: number;
};

/**
 * Current orientation of every rotatable mirror or splitter, and the mirrors the player has placed from the
 * inventory; both keyed by pointKey ("x,y").
 */
export type LaserState = {
  orientations: Readonly<Record<string, Orientation>>;
  placed: Readonly<Record<string, Orientation>>;
};

/**
 * A tap on (x, y): flips a rotatable mirror or splitter; on an empty cell it places a mirror from the inventory ("/"),
 * flips it ("\\") and takes it back.
 */
export type LaserMove = { x: number; y: number };

export const LIMITS = { minSize: 3, maxSize: 12, maxInventory: 3 } as const;

export type ProblemCode = "out-of-bounds" | "duplicate-cell" | "no-emitter" | "no-target" | "missing-color";

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

export function emitterColor(cell: { color?: Color }): Color {
  return cell.color ?? "red";
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
  const lasers = new Set<Color>();
  for (const { cell } of data.cells) if (cell.kind === "emitter") lasers.add(emitterColor(cell));
  if (lasers.size === 0) problems.push({ code: "no-emitter" });
  if (!data.cells.some((c) => c.cell.kind === "target")) problems.push({ code: "no-target" });
  data.cells.forEach(({ cell }, i) => {
    // A target that needs a color no laser has can never light up.
    if (lasers.size > 0 && cell.kind === "target" && cell.color && !lasers.has(cell.color)) {
      problems.push({ code: "missing-color", cell: i });
    }
  });
  return problems;
}

/** Validates untrusted data and returns a clean copy. Throws on any problem. */
export function validate(raw: unknown): LaserData {
  const data = parseDraft(raw);
  const problems = findProblems(data);
  if (problems.length > 0) throw new Error(`invalid puzzle: ${problems.map((p) => p.code).join(", ")}`);
  return data;
}

/**
 * Checks only the structure and returns a clean copy; editor drafts may still have problems.
 * Version 1 data comes back exactly as it was (no added fields), so its progress key does not change.
 */
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
  const data: LaserData = { width, height, cells };
  // 0 is the same as no inventory; it is dropped so both have the same content key.
  if (raw.inventory !== undefined && raw.inventory !== 0) {
    data.inventory = intIn(raw.inventory, 1, LIMITS.maxInventory, "inventory");
  }
  return data;
}

function parseCell(raw: unknown): LaserCell {
  if (!isRecord(raw)) throw new Error("cell content");
  switch (raw.kind) {
    case "wall":
      return { kind: "wall" };
    case "target": {
      if (raw.color === undefined) return { kind: "target" };
      return { kind: "target", color: parseColor(raw.color) };
    }
    case "emitter": {
      if (!isDir(raw.dir)) throw new Error("emitter dir");
      // Red is the default; it is not stored, so a red laser always looks the same.
      const color = raw.color === undefined ? "red" : parseColor(raw.color);
      return color === "red" ? { kind: "emitter", dir: raw.dir } : { kind: "emitter", dir: raw.dir, color };
    }
    case "mirror":
    case "splitter":
      if (raw.orientation !== "/" && raw.orientation !== "\\") throw new Error(`${raw.kind} orientation`);
      if (typeof raw.rotatable !== "boolean") throw new Error(`${raw.kind} rotatable`);
      return { kind: raw.kind, orientation: raw.orientation, rotatable: raw.rotatable };
    case "filter":
      return { kind: "filter", color: parseColor(raw.color) };
    default:
      throw new Error("cell kind");
  }
}

function parseColor(raw: unknown): Color {
  if (!COLORS.includes(raw as Color)) throw new Error("color");
  return raw as Color;
}

/** The oldest typeVersion that can represent this data (see PuzzleRules.minVersion). */
export function minVersion(data: LaserData): number {
  const colored = data.cells.some(
    ({ cell }) => cell.kind === "filter" || ((cell.kind === "emitter" || cell.kind === "target") && cell.color !== undefined),
  );
  if (colored) return 4;
  if (data.cells.some(({ cell }) => cell.kind === "splitter")) return 3;
  if (data.inventory !== undefined) return 2;
  return 1;
}

/** Each version only added optional things, so older data is valid as it is. */
export function migrate(data: unknown, fromVersion: number): unknown {
  if (fromVersion >= 1 && fromVersion < VERSION) return data;
  throw new Error(`no migration from version ${fromVersion}`);
}

export function isTurnable(cell: LaserCell): cell is Extract<LaserCell, { kind: "mirror" | "splitter" }> {
  return (cell.kind === "mirror" || cell.kind === "splitter") && cell.rotatable;
}

export function initState(data: LaserData): LaserState {
  const orientations: Record<string, Orientation> = {};
  for (const { x, y, cell } of data.cells) {
    if (isTurnable(cell)) orientations[pointKey({ x, y })] = cell.orientation;
  }
  return { orientations, placed: {} };
}

/** Index of the cell at (x, y) in data.cells, or -1. */
export function cellAt(data: LaserData, x: number, y: number): number {
  return data.cells.findIndex((c) => c.x === x && c.y === y);
}

/** Mirrors still in the inventory. */
export function inventoryLeft(data: LaserData, state: LaserState): number {
  return (data.inventory ?? 0) - Object.keys(state.placed).length;
}

export function applyMove(data: LaserData, state: LaserState, move: LaserMove): LaserState | null {
  const { x, y } = move;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= data.width || y >= data.height) return null;
  const key = pointKey(move);
  const current = state.orientations[key];
  if (current !== undefined) return { ...state, orientations: { ...state.orientations, [key]: flip(current) } };

  const placed = state.placed[key];
  if (placed === "/") return { ...state, placed: { ...state.placed, [key]: "\\" } };
  if (placed === "\\") {
    const { [key]: _removed, ...rest } = state.placed;
    return { ...state, placed: rest };
  }
  if (inventoryLeft(data, state) <= 0 || cellAt(data, x, y) >= 0) return null;
  return { ...state, placed: { ...state.placed, [key]: "/" } };
}

// --- Beam tracing ---

/** A beam as a polyline in cell units (cell centers are at x + 0.5). A splitter starts a new beam. */
export type Beam = {
  points: Point[];
  color: Color;
  /** Left the board, hit a wall, laser or filter of another color, or joins a beam that was already traced. */
  end: "edge" | "blocked" | "loop";
};

export type Trace = { beams: Beam[]; hit: ReadonlySet<string> }; // hit = pointKeys of lit targets

// Board encoding for fast repeated tracing (solver). One code per cell; orientation in the lowest bit.
export const EMPTY = 0;
export const WALL = 1;
export const EMITTER = 2;
export const TARGET = 3;
export const FILTER = 4;
export const MIRROR = 6; // MIRROR | 1 = "\\"
export const SPLITTER = 8; // SPLITTER | 1 = "\\"

/**
 * `cells`: code per position (y * width + x); mirror and splitter codes change while solving.
 * `colors`: for targets 0 = any, otherwise color index + 1; for filters the color index.
 */
export type Board = {
  width: number;
  height: number;
  cells: Uint8Array;
  colors: Uint8Array;
  emitters: { pos: number; dir: number; color: number }[];
  targets: number;
};

const DIR_INDEX: Record<Dir, number> = { N: 0, E: 1, S: 2, W: 3 };
const DIR_OF: readonly Dir[] = ["N", "E", "S", "W"];
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];
// REFLECT_INDEX[orientation bit][dir]
const REFLECT_INDEX = [
  DIR_OF.map((d) => DIR_INDEX[reflect(d, "/")]),
  DIR_OF.map((d) => DIR_INDEX[reflect(d, "\\")]),
];

export function orientationBit(orientation: Orientation): number {
  return orientation === "/" ? 0 : 1;
}

/** The board as data and state show it; cells outside the board or on an occupied field are ignored. */
export function prepare(data: LaserData, state?: LaserState): Board {
  const { width, height } = data;
  const cells = new Uint8Array(width * height);
  const colors = new Uint8Array(width * height);
  const used = new Uint8Array(width * height);
  const emitters: Board["emitters"] = [];
  let targets = 0;
  for (const { x, y, cell } of data.cells) {
    if (x < 0 || y < 0 || x >= width || y >= height || used[y * width + x]) continue;
    const pos = y * width + x;
    used[pos] = 1;
    switch (cell.kind) {
      case "wall":
        cells[pos] = WALL;
        break;
      case "emitter":
        cells[pos] = EMITTER;
        emitters.push({ pos, dir: DIR_INDEX[cell.dir], color: COLORS.indexOf(emitterColor(cell)) });
        break;
      case "target":
        cells[pos] = TARGET;
        colors[pos] = cell.color ? COLORS.indexOf(cell.color) + 1 : 0;
        targets++;
        break;
      case "filter":
        cells[pos] = FILTER;
        colors[pos] = COLORS.indexOf(cell.color);
        break;
      case "mirror":
      case "splitter": {
        const orientation = (cell.rotatable && state?.orientations[pointKey({ x, y })]) || cell.orientation;
        cells[pos] = (cell.kind === "mirror" ? MIRROR : SPLITTER) | orientationBit(orientation);
        break;
      }
    }
  }
  if (state) {
    for (const [key, orientation] of Object.entries(state.placed)) {
      const [x, y] = key.split(",").map(Number) as [number, number];
      if (x >= 0 && y >= 0 && x < width && y < height && cells[y * width + x] === EMPTY) {
        cells[y * width + x] = MIRROR | orientationBit(orientation);
      }
    }
  }
  return { width, height, cells, colors, emitters, targets };
}

/** What a trace finds. `order`: the positions beams enter, each once, in the order they are first entered. */
export type BoardTrace = { hitCount: number; hit: Uint8Array; order: number[]; beams: Beam[] | null };

/**
 * Follows every laser's beam, one after another; a splitter's reflected beam is followed after the current one.
 * A beam stops when it leaves the board, hits a wall, a laser or a filter of another color, or enters a cell in a
 * direction and color that was already traced (loops, and beams that join another one).
 * The trace is deterministic and reads a cell only when a beam enters it: changing a cell only changes what comes
 * after its first entry in `order`. The solver relies on that.
 */
export function traceBoard(board: Board, withBeams: boolean): BoardTrace {
  const { width, height, cells, colors } = board;
  const visited = new Uint8Array(width * height * 4 * COLORS.length);
  const hit = new Uint8Array(width * height);
  const entered = new Uint8Array(width * height);
  const order: number[] = [];
  const beams: Beam[] | null = withBeams ? [] : null;
  let hitCount = 0;
  // Pending beams: start position, direction, color.
  const pending: number[] = [];
  for (const emitter of board.emitters) {
    pending.push(emitter.pos, emitter.dir, emitter.color);
    while (pending.length > 0) {
      const color = pending.pop()!;
      let dir = pending.pop()!;
      const start = pending.pop()!;
      let x = start % width;
      let y = (start - x) / width;
      const points: Point[] | null = beams ? [{ x: x + 0.5, y: y + 0.5 }] : null;
      let end: Beam["end"];
      for (;;) {
        const nx = x + DX[dir]!;
        const ny = y + DY[dir]!;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
          end = "edge";
          break;
        }
        const pos = ny * width + nx;
        const code = cells[pos]!;
        if (code === WALL || code === EMITTER || (code === FILTER && colors[pos] !== color)) {
          end = "blocked";
          break;
        }
        x = nx;
        y = ny;
        if (!entered[pos]) {
          entered[pos] = 1;
          order.push(pos);
        }
        const state = (pos * 4 + dir) * COLORS.length + color;
        if (visited[state]) {
          end = "loop";
          break;
        }
        visited[state] = 1;
        if (code === TARGET && !hit[pos] && (colors[pos] === 0 || colors[pos] === color + 1)) {
          hit[pos] = 1;
          hitCount++;
        }
        if (code >= MIRROR) {
          const reflected = REFLECT_INDEX[code & 1]![dir]!;
          if ((code & ~1) === SPLITTER) {
            pending.push(pos, reflected, color); // the reflected part; this beam goes on straight
          } else {
            dir = reflected;
            points?.push({ x: x + 0.5, y: y + 0.5 });
          }
        }
      }
      if (points && beams) {
        if (end === "loop") {
          points.push({ x: x + 0.5, y: y + 0.5 });
        } else {
          // Stop at the border of the current cell, facing the obstacle or the edge.
          points.push({ x: x + 0.5 + DX[dir]! / 2, y: y + 0.5 + DY[dir]! / 2 });
        }
        beams.push({ points, color: COLORS[color]!, end });
      }
    }
  }
  return { hitCount, hit, order, beams };
}

export function traceBeams(data: LaserData, state: LaserState): Trace {
  const board = prepare(data, state);
  const result = traceBoard(board, true);
  const hit = new Set<string>();
  result.hit.forEach((h, pos) => {
    if (h) hit.add(pointKey({ x: pos % data.width, y: Math.floor(pos / data.width) }));
  });
  return { beams: result.beams!, hit };
}

export function targetCount(data: LaserData): number {
  return data.cells.filter((c) => c.cell.kind === "target").length;
}

/** Solved when every target is hit by a beam (of its color, if it needs one). */
export function isSolved(data: LaserData, state: LaserState): boolean {
  const board = prepare(data, state);
  return board.targets > 0 && traceBoard(board, false).hitCount === board.targets;
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
