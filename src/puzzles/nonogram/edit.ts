import { LIMITS, analyze, fromImage } from "./logic.ts";
import type { NonogramData } from "./logic.ts";

export type Tool = "fill" | "erase";

export const TOOLS: readonly Tool[] = ["fill", "erase"];

export function isTool(value: unknown): value is Tool {
  return TOOLS.includes(value as Tool);
}

/**
 * The picture the editor shows: the draft's own picture, or for a puzzle without one (a copy of a shared or
 * published puzzle) its unique solution; empty if neither exists.
 */
export function editorImage(data: NonogramData): string[] {
  if (data.image) return data.image;
  const result = analyze(data);
  const cells = result.status === "unique" ? result.solution : ".".repeat(data.width * data.height);
  return Array.from({ length: data.height }, (_, y) => cells.slice(y * data.width, (y + 1) * data.width));
}

/**
 * Paints (fill) or clears (erase) cell (x, y); `toggle` (keyboard) clears a filled cell with the fill tool.
 * The clues follow the picture. Returns the same object if nothing changes.
 */
export function applyTool(data: NonogramData, tool: Tool, x: number, y: number, toggle = false): NonogramData {
  if (x < 0 || y < 0 || x >= data.width || y >= data.height) return data;
  const image = editorImage(data);
  const current = image[y]![x];
  const next = tool === "erase" || (toggle && current === "#") ? "." : "#";
  if (current === next) return data.image ? data : fromImage(image);
  return fromImage(image.map((row, ry) => (ry === y ? row.slice(0, x) + next + row.slice(x + 1) : row)));
}

/** Changes the size; new cells are empty, cells outside the new size are cut. */
export function resize(data: NonogramData, width: number, height: number): NonogramData {
  const w = clamp(width, LIMITS.minSize, LIMITS.maxSize);
  const h = clamp(height, LIMITS.minSize, LIMITS.maxSize);
  if (w === data.width && h === data.height) return data;
  const image = editorImage(data);
  return fromImage(Array.from({ length: h }, (_, y) => (image[y] ?? "").slice(0, w).padEnd(w, ".")));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}
