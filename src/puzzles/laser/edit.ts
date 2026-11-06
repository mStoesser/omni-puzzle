import { DELTA, DIRS, rotateCW } from "../../core/grid.ts";
import type { Dir } from "../../core/grid.ts";
import { COLORS, LIMITS, cellAt, emitterColor, flip } from "./logic.ts";
import type { Color, LaserCell, LaserData, PlacedCell } from "./logic.ts";

export type Tool =
  | "emitter"
  | "target"
  | "mirror"
  | "rotatable"
  | "wall"
  | "erase"
  | "splitter"
  | "rotatableSplitter"
  | "filter"
  | "color";

export const TOOLS: readonly Tool[] = [
  "emitter",
  "target",
  "mirror",
  "rotatable",
  "wall",
  "erase",
  "splitter",
  "rotatableSplitter",
  "filter",
  "color",
];

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

  const next =
    tool === "color"
      ? current && recolor(current)
      : current && sameTool(current, tool)
        ? turn(current)
        : create(data, tool, x, y, current);
  if (!next) return data;
  if (next === current) return data;
  const others = data.cells.filter((_, i) => i !== hit);
  return { ...data, cells: sortCells([...others, { x, y, cell: next }]) };
}

/** Changes the board size; cells outside the new board are removed. */
export function resize(data: LaserData, width: number, height: number): LaserData {
  const w = clamp(width, LIMITS.minSize, LIMITS.maxSize);
  const h = clamp(height, LIMITS.minSize, LIMITS.maxSize);
  if (w === data.width && h === data.height) return data;
  return { ...data, width: w, height: h, cells: data.cells.filter((c) => c.x < w && c.y < h) };
}

/** Sets how many mirrors the player may place (0 to LIMITS.maxInventory; 0 removes the inventory). */
export function setInventory(data: LaserData, count: number): LaserData {
  const n = clamp(Math.round(count), 0, LIMITS.maxInventory);
  if (n === (data.inventory ?? 0)) return data;
  const { inventory: _old, ...rest } = data;
  return n === 0 ? rest : { ...rest, inventory: n };
}

const TARGET_COLORS: readonly (Color | undefined)[] = [undefined, ...COLORS];

/**
 * The color tool: lasers and filters cycle red → green → blue, targets any color → red → green → blue.
 * Returns the same cell if it has no color.
 */
function recolor(cell: LaserCell): LaserCell {
  switch (cell.kind) {
    case "emitter": {
      const color = nextColor(emitterColor(cell));
      const { color: _old, ...rest } = cell;
      return color === "red" ? rest : { ...rest, color };
    }
    case "filter":
      return { ...cell, color: nextColor(cell.color) };
    case "target": {
      const color = TARGET_COLORS[(TARGET_COLORS.indexOf(cell.color) + 1) % TARGET_COLORS.length];
      return color ? { kind: "target", color } : { kind: "target" };
    }
    default:
      return cell;
  }
}

function nextColor(color: Color): Color {
  return COLORS[(COLORS.indexOf(color) + 1) % COLORS.length]!;
}

function sameTool(cell: LaserCell, tool: Tool): boolean {
  if (cell.kind === "mirror") return tool === (cell.rotatable ? "rotatable" : "mirror");
  if (cell.kind === "splitter") return tool === (cell.rotatable ? "rotatableSplitter" : "splitter");
  return cell.kind === tool;
}

function turn(cell: LaserCell): LaserCell {
  switch (cell.kind) {
    case "emitter":
      return { ...cell, dir: rotateCW(cell.dir) };
    case "mirror":
    case "splitter":
      return { ...cell, orientation: flip(cell.orientation) };
    case "filter":
      return { ...cell, color: nextColor(cell.color) };
    case "wall":
    case "target":
      return cell; // nothing to turn
  }
}

function create(
  data: LaserData,
  tool: Exclude<Tool, "erase" | "color">,
  x: number,
  y: number,
  current: LaserCell | null,
): LaserCell {
  // Switching between mirrors and splitters, fixed or rotatable, keeps the orientation.
  const orientation = current?.kind === "mirror" || current?.kind === "splitter" ? current.orientation : "/";
  switch (tool) {
    case "wall":
      return { kind: "wall" };
    case "target":
      return { kind: "target" };
    case "emitter":
      return { kind: "emitter", dir: facingInside(data, x, y) };
    case "mirror":
    case "rotatable":
      return { kind: "mirror", orientation, rotatable: tool === "rotatable" };
    case "splitter":
    case "rotatableSplitter":
      return { kind: "splitter", orientation, rotatable: tool === "rotatableSplitter" };
    case "filter":
      return { kind: "filter", color: "red" };
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
