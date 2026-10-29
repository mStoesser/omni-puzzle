import { LIMITS, exitAxis } from "./logic.ts";
import type { Axis, Block, RushHourData } from "./logic.ts";

export type Tool = "block2" | "block3" | "target" | "exit" | "erase";

export const TOOLS: readonly Tool[] = ["block2", "block3", "target", "exit", "erase"];

export function isTool(value: unknown): value is Tool {
  return TOOLS.includes(value as Tool);
}

/**
 * Applies an editor tool at cell (x, y). Cells from -1 to width/height form a ring around
 * the board (used for the exit). Returns the same object if nothing changes.
 */
export function applyTool(data: RushHourData, tool: Tool, x: number, y: number): RushHourData {
  const inside = x >= 0 && y >= 0 && x < data.width && y < data.height;
  if (tool === "exit") return inside ? data : setExit(data, x, y);
  if (!inside) return data;

  const hit = blockAt(data, x, y);
  switch (tool) {
    case "erase":
      return hit < 0 ? data : { ...data, blocks: data.blocks.filter((_, i) => i !== hit) };
    case "target":
      if (hit >= 0) return markTarget(data, hit);
      return place(data, x, y, 2, preferredAxes(exitAxis(data.exit.side)), true);
    case "block2":
    case "block3":
      if (hit >= 0) return rotateBlock(data, hit);
      return place(data, x, y, tool === "block2" ? 2 : 3, ["h", "v"], false);
  }
}

/** Changes the board size; blocks that no longer fit are removed, the exit is kept on its side. */
export function resize(data: RushHourData, width: number, height: number): RushHourData {
  const w = clamp(width, LIMITS.minSize, LIMITS.maxSize);
  const h = clamp(height, LIMITS.minSize, LIMITS.maxSize);
  if (w === data.width && h === data.height) return data;
  const resized = { ...data, width: w, height: h };
  const lanes = exitAxis(data.exit.side) === "h" ? h : w;
  return {
    ...resized,
    blocks: data.blocks.filter((block, i) => fits(resized, block, i)),
    exit: { ...data.exit, index: Math.min(data.exit.index, lanes - 1) },
  };
}

/** Index of the block covering cell (x, y), or -1. */
export function blockAt(data: RushHourData, x: number, y: number): number {
  return data.blocks.findIndex((b) => covers(b, x, y));
}

function covers(b: Block, x: number, y: number): boolean {
  return b.axis === "h" ? b.y === y && x >= b.x && x < b.x + b.length : b.x === x && y >= b.y && y < b.y + b.length;
}

function setExit(data: RushHourData, x: number, y: number): RushHourData {
  const { width: w, height: h } = data;
  const exit =
    x === -1 && y >= 0 && y < h ? { side: "W" as const, index: y }
    : x === w && y >= 0 && y < h ? { side: "E" as const, index: y }
    : y === -1 && x >= 0 && x < w ? { side: "N" as const, index: x }
    : y === h && x >= 0 && x < w ? { side: "S" as const, index: x }
    : null; // corner or too far away
  if (!exit || (exit.side === data.exit.side && exit.index === data.exit.index)) return data;
  return { ...data, exit };
}

function markTarget(data: RushHourData, index: number): RushHourData {
  if (data.blocks[index]!.target && data.blocks.filter((b) => b.target).length === 1) return data;
  return { ...data, blocks: data.blocks.map((b, i) => withTarget(b, i === index)) };
}

function rotateBlock(data: RushHourData, index: number): RushHourData {
  const block = data.blocks[index]!;
  const rotated: Block = { ...block, axis: block.axis === "h" ? "v" : "h" };
  if (!fits(data, rotated, index)) return data;
  return { ...data, blocks: data.blocks.map((b, i) => (i === index ? rotated : b)) };
}

function place(data: RushHourData, x: number, y: number, length: number, axes: Axis[], target: boolean) {
  if (data.blocks.length >= LIMITS.maxBlocks) return data;
  for (const axis of axes) {
    const block = withTarget({ id: nextId(data), x, y, length, axis }, target);
    if (!fits(data, block, -1)) continue;
    const others = target ? data.blocks.map((b) => withTarget(b, false)) : data.blocks;
    return { ...data, blocks: [...others, block] };
  }
  return data;
}

function preferredAxes(first: Axis): Axis[] {
  return first === "h" ? ["h", "v"] : ["v", "h"];
}

function withTarget(block: Block, target: boolean): Block {
  if (target === !!block.target) return block;
  const { target: _, ...rest } = block;
  return target ? { ...rest, target: true } : rest;
}

/** Whether `block` lies on the board without overlapping any block except `ignore`. */
function fits(data: RushHourData, block: Block, ignore: number): boolean {
  for (let k = 0; k < block.length; k++) {
    const x = block.axis === "h" ? block.x + k : block.x;
    const y = block.axis === "v" ? block.y + k : block.y;
    if (x < 0 || y < 0 || x >= data.width || y >= data.height) return false;
    if (data.blocks.some((other, i) => i !== ignore && covers(other, x, y))) return false;
  }
  return true;
}

function nextId(data: RushHourData): string {
  const used = new Set(data.blocks.map((b) => b.id));
  let n = data.blocks.length;
  while (used.has(`b${n}`)) n++;
  return `b${n}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}
