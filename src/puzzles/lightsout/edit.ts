import { LIMITS, charAt, height, toggled, width } from "./logic.ts";
import type { LightsOutData } from "./logic.ts";

/**
 * - light: switches one light on or off (a hole becomes a cell with the light on); the solver checks the result.
 * - press: "tapping backwards" – a game move on the pattern. Built only with it, a puzzle is always solvable.
 * - hole: removes the cell (irregular shapes).
 * - erase: makes the cell a normal cell with the light off.
 */
export type Tool = "light" | "press" | "hole" | "erase";

export const TOOLS: readonly Tool[] = ["light", "press", "hole", "erase"];

export function isTool(value: unknown): value is Tool {
  return TOOLS.includes(value as Tool);
}

/** Applies an editor tool at cell (x, y). Returns the same object if nothing changes. */
export function applyTool(data: LightsOutData, tool: Tool, x: number, y: number): LightsOutData {
  if (x < 0 || y < 0 || x >= width(data) || y >= height(data)) return data;
  const current = charAt(data, x, y);
  switch (tool) {
    case "light":
      return setCells(data, [[x, y, current === "*" ? "." : "*"]]);
    case "hole":
      return setCells(data, [[x, y, "#"]]);
    case "erase":
      return setCells(data, [[x, y, "."]]);
    case "press": {
      if (current === "#") return data;
      const w = width(data);
      return setCells(
        data,
        toggled(data, x, y).map((cell): [number, number, string] => {
          const cx = cell % w;
          const cy = Math.floor(cell / w);
          return [cx, cy, charAt(data, cx, cy) === "*" ? "." : "*"];
        }),
      );
    }
  }
}

/** Changes the board size; new cells are cells with the light off, cells outside the new board are removed. */
export function resize(data: LightsOutData, w: number, h: number): LightsOutData {
  const nw = clamp(w, LIMITS.minSize, LIMITS.maxSize);
  const nh = clamp(h, LIMITS.minSize, LIMITS.maxSize);
  if (nw === width(data) && nh === height(data)) return data;
  const rows: string[] = [];
  for (let y = 0; y < nh; y++) rows.push((data.rows[y] ?? "").slice(0, nw).padEnd(nw, "."));
  return { rows };
}

function setCells(data: LightsOutData, changes: [x: number, y: number, ch: string][]): LightsOutData {
  if (changes.every(([x, y, ch]) => charAt(data, x, y) === ch)) return data;
  const rows = data.rows.map((row) => [...row]);
  for (const [x, y, ch] of changes) rows[y]![x] = ch;
  return { rows: rows.map((row) => row.join("")) };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}
