import { LIMITS, charAt, height, width } from "./logic.ts";
import type { SokobanData } from "./logic.ts";

export type Tool = "wall" | "box" | "goal" | "player" | "erase";

export const TOOLS: readonly Tool[] = ["wall", "box", "goal", "player", "erase"];

export function isTool(value: unknown): value is Tool {
  return TOOLS.includes(value as Tool);
}

// What a tool makes of a cell (XSB characters). Goals stay under boxes and the figure;
// a wall or the eraser removes them.
const RESULT: Record<Exclude<Tool, "player">, Record<string, string>> = {
  wall: { "#": "#", " ": "#", ".": "#", $: "#", "*": "#", "@": "#", "+": "#" },
  erase: { "#": " ", " ": " ", ".": " ", $: " ", "*": " ", "@": " ", "+": " " },
  box: { "#": "$", " ": "$", ".": "*", $: "$", "*": "*", "@": "$", "+": "*" },
  goal: { "#": ".", " ": ".", ".": ".", $: "*", "*": "*", "@": "+", "+": "+" },
};

const PLAYER: Record<string, string> = { "#": "@", " ": "@", ".": "+", $: "@", "*": "+", "@": "@", "+": "+" };

/**
 * Applies an editor tool at cell (x, y). There is only one figure, so placing it moves it.
 * Returns the same object if nothing changes.
 */
export function applyTool(data: SokobanData, tool: Tool, x: number, y: number): SokobanData {
  if (x < 0 || y < 0 || x >= width(data) || y >= height(data)) return data;
  const current = charAt(data, x, y);
  const next = tool === "player" ? PLAYER[current]! : RESULT[tool][current]!;
  if (next === current) return data;
  let rows = data.rows;
  // Remove the figure from its old cell(s) (keeping a goal there).
  if (tool === "player") rows = rows.map((row) => row.replaceAll("@", " ").replaceAll("+", "."));
  rows = rows.map((row, ry) => (ry === y ? row.slice(0, x) + next + row.slice(x + 1) : row));
  return { rows };
}

/** Changes the board size; new cells are floor, cells outside the new board are removed. */
export function resize(data: SokobanData, w: number, h: number): SokobanData {
  const nw = clamp(w, LIMITS.minSize, LIMITS.maxSize);
  const nh = clamp(h, LIMITS.minSize, LIMITS.maxSize);
  if (nw === width(data) && nh === height(data)) return data;
  const rows: string[] = [];
  for (let y = 0; y < nh; y++) rows.push((data.rows[y] ?? "").slice(0, nw).padEnd(nw, " "));
  return { rows };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}
