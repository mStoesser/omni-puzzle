import { isDir } from "../../core/grid.ts";
import type { Dir } from "../../core/grid.ts";

/** A rectangular block; `w` and `h` are 1 or 2 cells (larger sizes would need a new typeVersion). */
export type Block = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  target?: true;
};

/**
 * The exit lies on one side, starting at cell `index` along that side. It is as wide as the target block
 * (its extent along the side), so it has no width of its own.
 */
export type KlotskiData = {
  width: number;
  height: number;
  blocks: Block[];
  exit: { side: Dir; index: number };
};

/** Top-left cell of every block as a cell index (y · width + x), in the order of `data.blocks`. */
export type KlotskiState = { pos: readonly number[] };

/** Moves one block to the top-left cell (x, y), along any path over free cells (also around corners). */
export type KlotskiMove = { block: number; x: number; y: number };

export const LIMITS = { minSize: 3, maxSize: 10, maxBlockSize: 2, maxBlocks: 50, maxIdLength: 16 } as const;

export type ProblemCode =
  | "out-of-bounds" // block sticks out of the board
  | "overlap" // blocks share a cell
  | "duplicate-id"
  | "no-target"
  | "multiple-targets"
  | "exit-out-of-bounds"; // the exit, as wide as the target, does not fit on its side

export type Problem = { code: ProblemCode; block?: number };

export function createDefault(): KlotskiData {
  return {
    width: 4,
    height: 5,
    blocks: [{ id: "t", x: 1, y: 0, w: 2, h: 2, target: true }],
    exit: { side: "S", index: 1 },
  };
}

/** Index of the target block, or -1. */
export function targetIndex(data: KlotskiData): number {
  return data.blocks.findIndex((b) => b.target);
}

/** Cells the exit spans along its side: the target's width (north/south) or height (east/west); 1 without target. */
export function exitSpan(data: KlotskiData): number {
  const target = data.blocks[targetIndex(data)];
  if (!target) return 1;
  return data.exit.side === "N" || data.exit.side === "S" ? target.w : target.h;
}

/** Semantic problems of structurally valid data. Empty means the puzzle is valid. */
export function findProblems(data: KlotskiData): Problem[] {
  const problems: Problem[] = [];
  const owner = new Int16Array(data.width * data.height).fill(-1);
  const ids = new Set<string>();

  data.blocks.forEach((block, i) => {
    if (ids.has(block.id)) problems.push({ code: "duplicate-id", block: i });
    ids.add(block.id);
    if (block.x < 0 || block.y < 0 || block.x + block.w > data.width || block.y + block.h > data.height) {
      problems.push({ code: "out-of-bounds", block: i });
      return;
    }
    let overlaps = false;
    for (const cell of cellsAt(data, block, block.y * data.width + block.x)) {
      if (owner[cell] !== -1) overlaps = true;
      owner[cell] = i;
    }
    if (overlaps) problems.push({ code: "overlap", block: i });
  });

  const targets = data.blocks.filter((b) => b.target).length;
  if (targets === 0) problems.push({ code: "no-target" });
  if (targets > 1) problems.push({ code: "multiple-targets" });

  const { side, index } = data.exit;
  const length = side === "N" || side === "S" ? data.width : data.height;
  if (index < 0 || index + exitSpan(data) > length) problems.push({ code: "exit-out-of-bounds" });
  return problems;
}

/** Validates untrusted data and returns a clean copy. Throws on any problem. */
export function validate(raw: unknown): KlotskiData {
  const data = parseDraft(raw);
  const problems = findProblems(data);
  if (problems.length > 0) throw new Error(`invalid puzzle: ${problems.map((p) => p.code).join(", ")}`);
  return data;
}

/** Checks only the structure and returns a clean copy; editor drafts may still have problems. */
export function parseDraft(raw: unknown): KlotskiData {
  if (!isRecord(raw)) throw new Error("data is not an object");
  const width = intIn(raw.width, LIMITS.minSize, LIMITS.maxSize, "width");
  const height = intIn(raw.height, LIMITS.minSize, LIMITS.maxSize, "height");
  if (!Array.isArray(raw.blocks) || raw.blocks.length > LIMITS.maxBlocks) throw new Error("blocks");
  const blocks = raw.blocks.map((b: unknown): Block => {
    if (!isRecord(b)) throw new Error("block is not an object");
    if (typeof b.id !== "string" || b.id.length === 0 || b.id.length > LIMITS.maxIdLength) {
      throw new Error("block id");
    }
    if (b.target !== undefined && b.target !== true) throw new Error("block target");
    const block: Block = {
      id: b.id,
      x: intIn(b.x, 0, LIMITS.maxSize - 1, "block x"),
      y: intIn(b.y, 0, LIMITS.maxSize - 1, "block y"),
      w: intIn(b.w, 1, LIMITS.maxBlockSize, "block w"),
      h: intIn(b.h, 1, LIMITS.maxBlockSize, "block h"),
    };
    if (b.target) block.target = true;
    return block;
  });
  const exit = raw.exit;
  if (!isRecord(exit) || !isDir(exit.side)) throw new Error("exit");
  return {
    width,
    height,
    blocks,
    exit: { side: exit.side, index: intIn(exit.index, 0, LIMITS.maxSize - 1, "exit index") },
  };
}

export function initState(data: KlotskiData): KlotskiState {
  return { pos: data.blocks.map((b) => b.y * data.width + b.x) };
}

/** Top-left cell of a block in the given state. */
export function blockOrigin(data: KlotskiData, state: KlotskiState, block: number): { x: number; y: number } {
  const pos = state.pos[block]!;
  return { x: pos % data.width, y: Math.floor(pos / data.width) };
}

/** Which block covers each cell (-1 = free). */
export function occupancy(data: KlotskiData, state: KlotskiState): Int16Array {
  const occupied = new Int16Array(data.width * data.height).fill(-1);
  data.blocks.forEach((block, i) => {
    for (const cell of cellsAt(data, block, state.pos[i]!)) occupied[cell] = i;
  });
  return occupied;
}

/**
 * All top-left cells the block can reach by sliding one cell at a time over free cells,
 * without the start position. Order: breadth-first, so nearer positions come first.
 */
export function reachable(data: KlotskiData, state: KlotskiState, block: number, occupied = occupancy(data, state)): number[] {
  const b = data.blocks[block]!;
  const { width } = data;
  const maxX = width - b.w;
  const maxY = data.height - b.h;
  const start = state.pos[block]!;
  const fits = (pos: number) => {
    for (const cell of cellsAt(data, b, pos)) {
      const owner = occupied[cell]!;
      if (owner !== -1 && owner !== block) return false;
    }
    return true;
  };
  const seen = new Set([start]);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const pos = queue[i]!;
    const x = pos % width;
    const y = (pos - x) / width;
    const neighbours = [
      x > 0 ? pos - 1 : -1,
      x < maxX ? pos + 1 : -1,
      y > 0 ? pos - width : -1,
      y < maxY ? pos + width : -1,
    ];
    for (const next of neighbours) {
      if (next < 0 || seen.has(next) || !fits(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return queue.slice(1);
}

export function applyMove(data: KlotskiData, state: KlotskiState, move: KlotskiMove): KlotskiState | null {
  const { block, x, y } = move;
  if (!Number.isInteger(block) || block < 0 || block >= data.blocks.length) return null;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= data.width || y >= data.height) return null;
  const to = y * data.width + x;
  if (!reachable(data, state, block).includes(to)) return null;
  const pos = [...state.pos];
  pos[block] = to;
  return { pos };
}

export function legalMoves(data: KlotskiData, state: KlotskiState): KlotskiMove[] {
  const occupied = occupancy(data, state);
  const moves: KlotskiMove[] = [];
  for (let block = 0; block < data.blocks.length; block++) {
    for (const pos of reachable(data, state, block, occupied)) {
      moves.push({ block, x: pos % data.width, y: Math.floor(pos / data.width) });
    }
  }
  return moves;
}

/** Solved when the target block touches the board edge at the exit, aligned with it. */
export function isSolved(data: KlotskiData, state: KlotskiState): boolean {
  const i = targetIndex(data);
  if (i < 0) return false;
  const { x, y } = blockOrigin(data, state, i);
  const { w, h } = data.blocks[i]!;
  const { side, index } = data.exit;
  switch (side) {
    case "N":
      return y === 0 && x === index;
    case "S":
      return y + h === data.height && x === index;
    case "W":
      return x === 0 && y === index;
    case "E":
      return x + w === data.width && y === index;
  }
}

/** Cell indices a block covers with its top-left cell at `pos`. The block must fit on the board. */
function cellsAt(data: KlotskiData, block: Block, pos: number): number[] {
  const cells: number[] = [];
  for (let dy = 0; dy < block.h; dy++) {
    for (let dx = 0; dx < block.w; dx++) cells.push(pos + dy * data.width + dx);
  }
  return cells;
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
