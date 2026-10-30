import { DELTA, DIRS, rotateCW } from "../../core/grid.ts";
import type { Dir } from "../../core/grid.ts";
import { LIMITS, cellAt, flip } from "./logic.ts";
import type { LaserCell, LaserData, PlacedCell } from "./logic.ts";

export type Tool = "emitter" | "target" | "mirror" | "rotatable" | "wall" | "erase";

export const TOOLS: readonly Tool[] = ["emitter", "target", "mirror", "rotatable", "wall", "erase"];

export function isTool(value: unknown): value is Tool {
  return TOOLS.includes(value as Tool);
}

/**
 * Applies an editor tool at cell (x, y). Tapping a cell with the same tool again turns it
 * (emitter direction, mirror orientation); another tool replaces the content.
 * Returns the same object if nothing changes. Cells stay sorted by row, then column.
 */
export function applyTool(data: LaserData, tool: Tool, x: number, y: number): LaserData {
  if (x < 0 || y < 0 || x >= data.width || y >= data.height) return data;
  const hit = cellAt(data, x, y);
  const current = hit >= 0 ? data.cells[hit]!.cell : null;

  if (tool === "erase") return hit < 0 ? data : { ...data, cells: data.cells.filter((_, i) => i !== hit) };

  const next = current && sameTool(current, tool) ? turn(current) : create(data, tool, x, y, current);
  if (next === current) return data;
  const others = data.cells.filter((_, i) => i !== hit);
  return { ...data, cells: sortCells([...others, { x, y, cell: next }]) };
}

/** Changes the board size; cells outside the new board are removed. */
export function resize(data: LaserData, width: number, height: number): LaserData {
  const w = clamp(width, LIMITS.minSize, LIMITS.maxSize);
  const h = clamp(height, LIMITS.minSize, LIMITS.maxSize);
  if (w === data.width && h === data.height) return data;
  return { width: w, height: h, cells: data.cells.filter((c) => c.x < w && c.y < h) };
}

function sameTool(cell: LaserCell, tool: Tool): boolean {
  if (cell.kind === "mirror") return tool === (cell.rotatable ? "rotatable" : "mirror");
  return cell.kind === tool;
}

function turn(cell: LaserCell): LaserCell {
  switch (cell.kind) {
    case "emitter":
      return { ...cell, dir: rotateCW(cell.dir) };
    case "mirror":
      return { ...cell, orientation: flip(cell.orientation) };
    case "wall":
    case "target":
      return cell; // nothing to turn
  }
}

function create(data: LaserData, tool: Exclude<Tool, "erase">, x: number, y: number, current: LaserCell | null): LaserCell {
  switch (tool) {
    case "wall":
      return { kind: "wall" };
    case "target":
      return { kind: "target" };
    case "emitter":
      return { kind: "emitter", dir: facingInside(data, x, y) };
    case "mirror":
    case "rotatable":
      // Switching between fixed and rotatable keeps the orientation.
      return { kind: "mirror", orientation: current?.kind === "mirror" ? current.orientation : "/", rotatable: tool === "rotatable" };
  }
}

/** The direction with the most room, so a new emitter points into the board. */
function facingInside(data: LaserData, x: number, y: number): Dir {
  let best: Dir = "E";
  let bestRoom = -1;
  for (const dir of [...DIRS.slice(1), DIRS[0]!]) {
    const [dx, dy] = DELTA[dir];
    const room = dx > 0 ? data.width - 1 - x : dx < 0 ? x : dy > 0 ? data.height - 1 - y : y;
    if (room > bestRoom) {
      best = dir;
      bestRoom = room;
    }
  }
  return best;
}

function sortCells(cells: PlacedCell[]): PlacedCell[] {
  return cells.sort((a, b) => a.y - b.y || a.x - b.x);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
