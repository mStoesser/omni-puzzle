import { isDir } from "../../core/grid.ts";
import type { Dir } from "../../core/grid.ts";

export type Axis = "h" | "v";

export type Block = {
  id: string;
  x: number;
  y: number;
  length: number;
  axis: Axis;
  target?: true;
};

export type RushHourData = {
  width: number;
  height: number;
  blocks: Block[];
  exit: { side: Dir; index: number };
};

/** Position of every block along its axis (x for "h", y for "v"). */
export type RushHourState = { pos: number[] };

export type RushHourMove = { block: number; delta: number };

export const LIMITS = { minSize: 3, maxSize: 12, maxBlocks: 64, maxIdLength: 16 } as const;

export type ProblemCode =
  | "out-of-bounds" // block sticks out of the board
  | "overlap" // blocks share a cell
  | "duplicate-id"
  | "no-target"
  | "multiple-targets"
  | "exit-out-of-bounds"
  | "exit-axis" // target block cannot move towards the exit side
  | "exit-lane"; // target block is not in the exit's row/column

export type Problem = { code: ProblemCode; block?: number };

export function exitAxis(side: Dir): Axis {
  return side === "E" || side === "W" ? "h" : "v";
}

export function createDefault(): RushHourData {
  return {
    width: 6,
    height: 6,
    blocks: [{ id: "t", x: 0, y: 2, length: 2, axis: "h", target: true }],
    exit: { side: "E", index: 2 },
  };
}

/** Semantic problems of structurally valid data. Empty means the puzzle is valid. */
export function findProblems(data: RushHourData): Problem[] {
  const problems: Problem[] = [];
  const owner = new Int16Array(data.width * data.height).fill(-1);
  const ids = new Set<string>();

  data.blocks.forEach((block, i) => {
    if (ids.has(block.id)) problems.push({ code: "duplicate-id", block: i });
    ids.add(block.id);
    const endX = block.axis === "h" ? block.x + block.length : block.x + 1;
    const endY = block.axis === "v" ? block.y + block.length : block.y + 1;
    if (block.x < 0 || block.y < 0 || endX > data.width || endY > data.height) {
      problems.push({ code: "out-of-bounds", block: i });
      return;
    }
    let overlaps = false;
    for (const cell of cellsOf(block, block.axis === "h" ? block.x : block.y)) {
      const index = cell.y * data.width + cell.x;
      if (owner[index] !== -1) overlaps = true;
      owner[index] = i;
    }
    if (overlaps) problems.push({ code: "overlap", block: i });
  });

  const { side, index } = data.exit;
  const lanes = exitAxis(side) === "h" ? data.height : data.width;
  if (index < 0 || index >= lanes) problems.push({ code: "exit-out-of-bounds" });

  const targets = data.blocks.flatMap((block, i) => (block.target ? [i] : []));
  if (targets.length === 0) problems.push({ code: "no-target" });
  if (targets.length > 1) problems.push({ code: "multiple-targets" });
  if (targets.length === 1) {
    const i = targets[0]!;
    const target = data.blocks[i]!;
    if (target.axis !== exitAxis(side)) {
      problems.push({ code: "exit-axis", block: i });
    } else if ((target.axis === "h" ? target.y : target.x) !== index) {
      problems.push({ code: "exit-lane", block: i });
    }
  }
  return problems;
}

/** Validates untrusted data and returns a clean copy. Throws on any problem. */
export function validate(raw: unknown): RushHourData {
  const data = parseShape(raw);
  const problems = findProblems(data);
  if (problems.length > 0) throw new Error(`invalid puzzle: ${problems.map((p) => p.code).join(", ")}`);
  return data;
}

function parseShape(raw: unknown): RushHourData {
  if (!isRecord(raw)) throw new Error("data is not an object");
  const width = intIn(raw.width, LIMITS.minSize, LIMITS.maxSize, "width");
  const height = intIn(raw.height, LIMITS.minSize, LIMITS.maxSize, "height");
  if (!Array.isArray(raw.blocks) || raw.blocks.length > LIMITS.maxBlocks) throw new Error("blocks");
  const blocks = raw.blocks.map((b: unknown): Block => {
    if (!isRecord(b)) throw new Error("block is not an object");
    if (typeof b.id !== "string" || b.id.length === 0 || b.id.length > LIMITS.maxIdLength) {
      throw new Error("block id");
    }
    if (b.axis !== "h" && b.axis !== "v") throw new Error("block axis");
    if (b.target !== undefined && b.target !== true) throw new Error("block target");
    const block: Block = {
      id: b.id,
      x: intIn(b.x, 0, LIMITS.maxSize - 1, "block x"),
      y: intIn(b.y, 0, LIMITS.maxSize - 1, "block y"),
      length: intIn(b.length, 1, LIMITS.maxSize, "block length"),
      axis: b.axis,
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

export function initState(data: RushHourData): RushHourState {
  return { pos: data.blocks.map((b) => (b.axis === "h" ? b.x : b.y)) };
}

/** How far a block can move: delta in [min, max], both inclusive. */
export function moveRange(data: RushHourData, state: RushHourState, block: number): { min: number; max: number } {
  const occupied = occupancy(data, state);
  const b = data.blocks[block]!;
  const pos = state.pos[block]!;
  const size = b.axis === "h" ? data.width : data.height;
  const isFree = (p: number) => {
    const x = b.axis === "h" ? p : b.x;
    const y = b.axis === "v" ? p : b.y;
    return occupied[y * data.width + x] === -1;
  };
  let min = 0;
  while (pos + min - 1 >= 0 && isFree(pos + min - 1)) min--;
  let max = 0;
  while (pos + b.length + max < size && isFree(pos + b.length + max)) max++;
  return { min, max };
}

export function applyMove(data: RushHourData, state: RushHourState, move: RushHourMove): RushHourState | null {
  const { block, delta } = move;
  if (!Number.isInteger(block) || block < 0 || block >= data.blocks.length) return null;
  if (!Number.isInteger(delta) || delta === 0) return null;
  const { min, max } = moveRange(data, state, block);
  if (delta < min || delta > max) return null;
  const pos = [...state.pos];
  pos[block] = pos[block]! + delta;
  return { pos };
}

export function legalMoves(data: RushHourData, state: RushHourState): RushHourMove[] {
  const moves: RushHourMove[] = [];
  for (let block = 0; block < data.blocks.length; block++) {
    const { min, max } = moveRange(data, state, block);
    for (let delta = min; delta <= max; delta++) if (delta !== 0) moves.push({ block, delta });
  }
  return moves;
}

/** Solved when the target block touches the board edge at the exit. */
export function isSolved(data: RushHourData, state: RushHourState): boolean {
  const i = data.blocks.findIndex((b) => b.target);
  if (i < 0) return false;
  const pos = state.pos[i]!;
  const length = data.blocks[i]!.length;
  switch (data.exit.side) {
    case "W":
    case "N":
      return pos === 0;
    case "E":
      return pos + length === data.width;
    case "S":
      return pos + length === data.height;
  }
}

/** Top-left cell of a block in the given state. */
export function blockOrigin(data: RushHourData, state: RushHourState, block: number): { x: number; y: number } {
  const b = data.blocks[block]!;
  const pos = state.pos[block]!;
  return b.axis === "h" ? { x: pos, y: b.y } : { x: b.x, y: pos };
}

function cellsOf(block: Block, pos: number): { x: number; y: number }[] {
  return Array.from({ length: block.length }, (_, k) =>
    block.axis === "h" ? { x: pos + k, y: block.y } : { x: block.x, y: pos + k },
  );
}

function occupancy(data: RushHourData, state: RushHourState): Int16Array {
  const occupied = new Int16Array(data.width * data.height).fill(-1);
  data.blocks.forEach((block, i) => {
    for (const cell of cellsOf(block, state.pos[i]!)) occupied[cell.y * data.width + cell.x] = i;
  });
  return occupied;
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
