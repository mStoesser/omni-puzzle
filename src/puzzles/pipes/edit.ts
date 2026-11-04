import { DELTA, DIRS, opposite } from "../../core/grid.ts";
import type { Point } from "../../core/grid.ts";
import { BIT, LIMITS, canTurn, height, maskAt, rotateMask, width } from "./logic.ts";
import type { PipesData } from "./logic.ts";

/**
 * - pipe: drawing from cell to cell lays a pipe between them (see drawPath)
 * - source: moves the source
 * - turn: turns one tile a quarter clockwise (to set its start orientation by hand)
 * - fixed: marks a tile as fixed or turnable
 * - erase: removes the tile and the pipe ends of its neighbours that lead into it
 */
export type Tool = "pipe" | "source" | "turn" | "fixed" | "erase";

export const TOOLS: readonly Tool[] = ["pipe", "source", "turn", "fixed", "erase"];

export function isTool(value: unknown): value is Tool {
  return TOOLS.includes(value as Tool);
}

/** Applies a tap tool at cell (x, y). Returns the same object if nothing changes. The pipe tool is drawPath. */
export function applyTool(data: PipesData, tool: Exclude<Tool, "pipe">, x: number, y: number): PipesData {
  const w = width(data);
  if (x < 0 || y < 0 || x >= w || y >= height(data)) return data;
  const cell = y * w + x;
  const mask = maskAt(data, x, y);
  switch (tool) {
    case "source":
      return data.source.x === x && data.source.y === y ? data : { ...data, source: { x, y } };
    case "turn":
      return canTurn(mask) ? setMasks(data, [[x, y, rotateMask(mask, 1)]]) : data;
    case "fixed":
      if (data.fixed.includes(cell)) return { ...data, fixed: data.fixed.filter((c) => c !== cell) };
      return mask === 0 ? data : { ...data, fixed: [...data.fixed, cell].sort((a, b) => a - b) };
    case "erase": {
      const changes: [number, number, number][] = [[x, y, 0]];
      for (const dir of DIRS) {
        const [dx, dy] = DELTA[dir];
        const neighbour = maskAt(data, x + dx, y + dy);
        if (neighbour & BIT[opposite(dir)]) changes.push([x + dx, y + dy, neighbour & ~BIT[opposite(dir)]]);
      }
      const erased = setMasks(data, changes);
      return erased.fixed.includes(cell) ? { ...erased, fixed: erased.fixed.filter((c) => c !== cell) } : erased;
    }
  }
}

/** Lays pipes between consecutive cells of a path; steps between cells that are not neighbours are skipped. */
export function drawPath(data: PipesData, cells: readonly Point[]): PipesData {
  let next = data;
  for (let i = 1; i < cells.length; i++) next = connect(next, cells[i - 1]!, cells[i]!);
  return next;
}

/** Connects two neighbouring cells with a pipe (sets the pipe end on both sides). */
export function connect(data: PipesData, a: Point, b: Point): PipesData {
  const dir = DIRS.find((d) => a.x + DELTA[d][0] === b.x && a.y + DELTA[d][1] === b.y);
  if (!dir || !inside(data, a) || !inside(data, b)) return data;
  return setMasks(data, [
    [a.x, a.y, maskAt(data, a.x, a.y) | BIT[dir]],
    [b.x, b.y, maskAt(data, b.x, b.y) | BIT[opposite(dir)]],
  ]);
}

/** Turns every turnable tile randomly (`random` in [0, 1)); fixed tiles stay. */
export function scramble(data: PipesData, random: () => number): PipesData {
  const w = width(data);
  const rows = data.rows.map((row, y) =>
    [...row]
      .map((ch, x) => {
        const mask = parseInt(ch, 16);
        if (!canTurn(mask) || data.fixed.includes(y * w + x)) return ch;
        return rotateMask(mask, Math.floor(random() * 4)).toString(16);
      })
      .join(""),
  );
  return { ...data, rows };
}

/** Changes the board size; new cells are empty, the source stays on the board, fixed tiles keep their place. */
export function resize(data: PipesData, w: number, h: number): PipesData {
  const nw = clamp(w, LIMITS.minSize, LIMITS.maxSize);
  const nh = clamp(h, LIMITS.minSize, LIMITS.maxSize);
  const ow = width(data);
  if (nw === ow && nh === height(data)) return data;
  const rows: string[] = [];
  for (let y = 0; y < nh; y++) rows.push((data.rows[y] ?? "").slice(0, nw).padEnd(nw, "0"));
  const fixed = data.fixed
    .map((cell) => ({ x: cell % ow, y: Math.floor(cell / ow) }))
    .filter((p) => p.x < nw && p.y < nh)
    .map((p) => p.y * nw + p.x)
    .sort((a, b) => a - b);
  const source = { x: Math.min(data.source.x, nw - 1), y: Math.min(data.source.y, nh - 1) };
  return { rows, source, fixed };
}

function inside(data: PipesData, p: Point): boolean {
  return p.x >= 0 && p.y >= 0 && p.x < width(data) && p.y < height(data);
}

function setMasks(data: PipesData, changes: [x: number, y: number, mask: number][]): PipesData {
  if (changes.every(([x, y, m]) => maskAt(data, x, y) === m)) return data;
  const rows = data.rows.map((row) => [...row]);
  for (const [x, y, m] of changes) rows[y]![x] = m.toString(16);
  return { ...data, rows: rows.map((row) => row.join("")) };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}
