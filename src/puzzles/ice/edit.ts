import { LIMITS, cellAt } from "./logic.ts";
import type { IceCell, IceData, IceKind } from "./logic.ts";

export type Tool = IceKind | "erase";

export const TOOLS: readonly Tool[] = ["wall", "sand", "goal", "start", "erase"];

export function isTool(value: unknown): value is Tool {
  return TOOLS.includes(value as Tool);
}

/**
 * Applies an editor tool at cell (x, y): places that kind (replacing what is there) or erases.
 * There is only one start, so placing it moves it. Returns the same object if nothing changes.
 */
export function applyTool(data: IceData, tool: Tool, x: number, y: number): IceData {
  if (x < 0 || y < 0 || x >= data.width || y >= data.height) return data;
  const hit = cellAt(data, x, y);
  if (tool === "erase") return hit < 0 ? data : { ...data, cells: data.cells.filter((_, i) => i !== hit) };
  if (hit >= 0 && data.cells[hit]!.kind === tool) return data;
  const others = data.cells.filter((c, i) => i !== hit && !(tool === "start" && c.kind === "start"));
  return { ...data, cells: sortCells([...others, { x, y, kind: tool }]) };
}

/** Changes the board size; cells outside the new board are removed. */
export function resize(data: IceData, width: number, height: number): IceData {
  const w = clamp(width, LIMITS.minSize, LIMITS.maxSize);
  const h = clamp(height, LIMITS.minSize, LIMITS.maxSize);
  if (w === data.width && h === data.height) return data;
  return { width: w, height: h, cells: data.cells.filter((c) => c.x < w && c.y < h) };
}

function sortCells(cells: IceCell[]): IceCell[] {
  return cells.sort((a, b) => a.y - b.y || a.x - b.x);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}
