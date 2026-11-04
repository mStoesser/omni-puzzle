import { DELTA, DIRS, opposite } from "../../core/grid.ts";
import type { Dir } from "../../core/grid.ts";

// Pipes: every tile has pipe ends towards some of its four sides. Tapping a rotatable tile turns it
// a quarter clockwise. Solved when every pipe end meets a pipe end of the neighbouring tile (no open end)
// and all tiles are connected to the source. Loops are allowed.
//
// A tile is a bit mask of its pipe ends as placed at the start: N = 1, E = 2, S = 4, W = 8.
// The shape follows from the mask: one end, straight, curve, T or cross; 0 is an empty cell.
// `rows` holds one hex digit per cell.

export type PipesData = {
  rows: string[];
  source: { x: number; y: number };
  /** Cell indexes (y · width + x) of tiles that cannot be turned, ascending. */
  fixed: number[];
};

/** Quarter turns clockwise per cell so far (taps; only the value modulo 4 matters for the shape). */
export type PipesState = { turns: readonly number[] };

/** Turn the tile at (x, y) a quarter clockwise. */
export type PipesMove = { x: number; y: number };

export const LIMITS = { minSize: 3, maxSize: 10 } as const;

export const BIT: Record<Dir, number> = { N: 1, E: 2, S: 4, W: 8 };

export type ProblemCode = "no-pipes" | "source-empty";

export type Problem = { code: ProblemCode };

export function createDefault(): PipesData {
  // Source → straight → end; the straight needs one turn.
  return { rows: ["000", "258", "000"], source: { x: 0, y: 1 }, fixed: [] };
}

export function width(data: PipesData): number {
  return data.rows[0]?.length ?? 0;
}

export function height(data: PipesData): number {
  return data.rows.length;
}

/** The mask at (x, y) as placed at the start; 0 outside the board. */
export function maskAt(data: PipesData, x: number, y: number): number {
  const ch = data.rows[y]?.[x];
  return ch === undefined ? 0 : parseInt(ch, 16);
}

/** The mask turned a quarter clockwise `turns` times. */
export function rotateMask(mask: number, turns: number): number {
  let m = mask;
  for (let i = 0; i < ((turns % 4) + 4) % 4; i++) m = ((m << 1) | (m >> 3)) & 15;
  return m;
}

/** Whether turning changes the tile at all (empty cells and crosses look the same in every direction). */
export function canTurn(mask: number): boolean {
  return mask !== 0 && mask !== 15;
}

export function isFixed(data: PipesData, x: number, y: number): boolean {
  return data.fixed.includes(y * width(data) + x);
}

export function findProblems(data: PipesData): Problem[] {
  const problems: Problem[] = [];
  if (data.rows.every((row) => /^0*$/.test(row))) problems.push({ code: "no-pipes" });
  else if (maskAt(data, data.source.x, data.source.y) === 0) problems.push({ code: "source-empty" });
  return problems;
}

/** Validates untrusted data and returns a clean copy. Throws on any problem. */
export function validate(raw: unknown): PipesData {
  const data = parseDraft(raw);
  const problems = findProblems(data);
  if (problems.length > 0) throw new Error(`invalid puzzle: ${problems.map((p) => p.code).join(", ")}`);
  return data;
}

/** Checks only the structure and returns a clean copy; editor drafts may still have problems. */
export function parseDraft(raw: unknown): PipesData {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("data is not an object");
  const { rows, source, fixed } = raw as Record<string, unknown>;
  if (!Array.isArray(rows) || rows.length < LIMITS.minSize || rows.length > LIMITS.maxSize) throw new Error("rows");
  const w = typeof rows[0] === "string" ? rows[0].length : -1;
  if (w < LIMITS.minSize || w > LIMITS.maxSize) throw new Error("width");
  for (const row of rows) {
    if (typeof row !== "string" || row.length !== w || !/^[0-9a-f]*$/.test(row)) throw new Error("row");
  }
  if (typeof source !== "object" || source === null) throw new Error("source");
  const { x, y } = source as Record<string, unknown>;
  if (!Number.isInteger(x) || !Number.isInteger(y) || (x as number) < 0 || (y as number) < 0) throw new Error("source");
  if ((x as number) >= w || (y as number) >= rows.length) throw new Error("source");
  if (!Array.isArray(fixed) || fixed.length > w * rows.length) throw new Error("fixed");
  for (let i = 0; i < fixed.length; i++) {
    const cell = fixed[i];
    if (!Number.isInteger(cell) || cell < 0 || cell >= w * rows.length) throw new Error("fixed cell");
    if (i > 0 && cell <= fixed[i - 1]) throw new Error("fixed order");
  }
  return { rows: [...rows] as string[], source: { x: x as number, y: y as number }, fixed: [...fixed] as number[] };
}

export function initState(data: PipesData): PipesState {
  return { turns: new Array<number>(width(data) * height(data)).fill(0) };
}

/** Current mask of every cell. */
export function currentMasks(data: PipesData, state: PipesState): number[] {
  const w = width(data);
  return state.turns.map((turns, i) => rotateMask(maskAt(data, i % w, Math.floor(i / w)), turns));
}

export function applyMove(data: PipesData, state: PipesState, move: PipesMove): PipesState | null {
  const { x, y } = move;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= width(data) || y >= height(data)) return null;
  if (!canTurn(maskAt(data, x, y)) || isFixed(data, x, y)) return null;
  const turns = [...state.turns];
  turns[y * width(data) + x]! += 1;
  return { turns };
}

/**
 * Cells connected to the source through pipe ends that meet, with their distance from the source
 * (in tiles). Without a pipe at the source the map is empty.
 */
export function connected(data: PipesData, masks: readonly number[]): Map<number, number> {
  const w = width(data);
  const h = height(data);
  const start = data.source.y * w + data.source.x;
  const distance = new Map<number, number>();
  if (!masks[start]) return distance;
  distance.set(start, 0);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const cell = queue[i]!;
    const x = cell % w;
    const y = Math.floor(cell / w);
    for (const dir of DIRS) {
      if (!(masks[cell]! & BIT[dir])) continue;
      const [dx, dy] = DELTA[dir];
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const next = ny * w + nx;
      if (distance.has(next) || !(masks[next]! & BIT[opposite(dir)])) continue;
      distance.set(next, distance.get(cell)! + 1);
      queue.push(next);
    }
  }
  return distance;
}

/** Number of pipe ends that do not meet a pipe end (towards the edge, an empty cell or a turned-away tile). */
export function openEnds(data: PipesData, masks: readonly number[]): number {
  const w = width(data);
  let open = 0;
  masks.forEach((mask, cell) => {
    const x = cell % w;
    const y = Math.floor(cell / w);
    for (const dir of DIRS) {
      if (!(mask & BIT[dir])) continue;
      const [dx, dy] = DELTA[dir];
      const nx = x + dx;
      const ny = y + dy;
      const inside = nx >= 0 && ny >= 0 && nx < w && ny < height(data);
      if (!inside || !(masks[ny * w + nx]! & BIT[opposite(dir)])) open++;
    }
  });
  return open;
}

/** Solved when no pipe end is open and every tile is connected to the source. */
export function isSolved(data: PipesData, state: PipesState): boolean {
  const masks = currentMasks(data, state);
  if (openEnds(data, masks) > 0) return false;
  const reached = connected(data, masks);
  return masks.every((mask, cell) => mask === 0 || reached.has(cell));
}
