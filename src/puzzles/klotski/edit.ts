import { LIMITS, exitSpan } from "./logic.ts";
import type { Block, KlotskiData } from "./logic.ts";

export type Tool = "block11" | "block21" | "block12" | "block22" | "target" | "exit" | "erase";

export const TOOLS: readonly Tool[] = ["block11", "block21", "block12", "block22", "target", "exit", "erase"];

/** Block size of each size tool: width × height. */
export const TOOL_SIZE = {
  block11: { w: 1, h: 1 },
  block21: { w: 2, h: 1 },
  block12: { w: 1, h: 2 },
  block22: { w: 2, h: 2 },
} as const;

/** Sizes a new target block tries, largest first. */
const TARGET_SIZES = [TOOL_SIZE.block22, TOOL_SIZE.block21, TOOL_SIZE.block12, TOOL_SIZE.block11] as const;

export function isTool(value: unknown): value is Tool {
  return TOOLS.includes(value as Tool);
}

/**
 * Applies an editor tool at cell (x, y). Cells from -1 to width/height form a ring around
 * the board (used for the exit). Returns the same object if nothing changes.
 */
export function applyTool(data: KlotskiData, tool: Tool, x: number, y: number): KlotskiData {
  const inside = x >= 0 && y >= 0 && x < data.width && y < data.height;
  if (tool === "exit") return inside ? data : setExit(data, x, y);
  if (!inside) return data;

  const hit = blockAt(data, x, y);
  switch (tool) {
    case "erase":
      return hit < 0 ? data : { ...data, blocks: data.blocks.filter((_, i) => i !== hit) };
    case "target":
      if (hit >= 0) return markTarget(data, hit);
      for (const size of TARGET_SIZES) {
        const placed = place(data, x, y, size, true);
        if (placed !== data) return placed;
      }
      return data;
    default:
      if (hit >= 0) return resizeBlock(data, hit, TOOL_SIZE[tool]);
      return place(data, x, y, TOOL_SIZE[tool], false);
  }
}

/** Changes the board size; blocks that no longer fit are removed, the exit stays on its side. */
export function resize(data: KlotskiData, width: number, height: number): KlotskiData {
  const w = clamp(width, LIMITS.minSize, LIMITS.maxSize);
  const h = clamp(height, LIMITS.minSize, LIMITS.maxSize);
  if (w === data.width && h === data.height) return data;
  const blocks = data.blocks.filter((b) => b.x + b.w <= w && b.y + b.h <= h);
  return clampExit({ ...data, width: w, height: h, blocks });
}

/** Index of the block covering cell (x, y), or -1. */
export function blockAt(data: KlotskiData, x: number, y: number): number {
  return data.blocks.findIndex((b) => covers(b, x, y));
}

function covers(b: Block, x: number, y: number): boolean {
  return x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;
}

/** Sets the exit at a ring cell; the exit starts there, or as far along as it still fits. */
function setExit(data: KlotskiData, x: number, y: number): KlotskiData {
  const { width: w, height: h } = data;
  const exit =
    x === -1 && y >= 0 && y < h ? { side: "W" as const, index: y }
    : x === w && y >= 0 && y < h ? { side: "E" as const, index: y }
    : y === -1 && x >= 0 && x < w ? { side: "N" as const, index: x }
    : y === h && x >= 0 && x < w ? { side: "S" as const, index: x }
    : null; // corner or too far away
  if (!exit) return data;
  const next = clampExit({ ...data, exit });
  return next.exit.side === data.exit.side && next.exit.index === data.exit.index ? data : next;
}

/** Moves the exit index back so that the exit (as wide as the target) fits on its side. */
function clampExit(data: KlotskiData): KlotskiData {
  const { side, index } = data.exit;
  const length = side === "N" || side === "S" ? data.width : data.height;
  const max = Math.max(0, length - exitSpan(data));
  return index <= max ? data : { ...data, exit: { side, index: max } };
}

function markTarget(data: KlotskiData, index: number): KlotskiData {
  if (data.blocks[index]!.target && data.blocks.filter((b) => b.target).length === 1) return data;
  return clampExit({ ...data, blocks: data.blocks.map((b, i) => withTarget(b, i === index)) });
}

/** Gives an existing block another size, keeping its top-left cell, if it still fits. */
function resizeBlock(data: KlotskiData, index: number, size: { w: number; h: number }): KlotskiData {
  const block = data.blocks[index]!;
  if (block.w === size.w && block.h === size.h) return data;
  const resized: Block = { ...block, ...size };
  if (!fits(data, resized, index)) return data;
  const next = { ...data, blocks: data.blocks.map((b, i) => (i === index ? resized : b)) };
  return block.target ? clampExit(next) : next;
}

/**
 * Places a new block that covers cell (x, y): preferably with its top-left cell there, otherwise
 * shifted up and left (e.g. a 2×2 block tapped in the last column).
 */
function place(data: KlotskiData, x: number, y: number, size: { w: number; h: number }, target: boolean) {
  if (data.blocks.length >= LIMITS.maxBlocks) return data;
  for (let dy = 0; dy < size.h; dy++) {
    for (let dx = 0; dx < size.w; dx++) {
      const block = withTarget({ id: nextId(data), x: x - dx, y: y - dy, ...size }, target);
      if (!fits(data, block, -1)) continue;
      const others = target ? data.blocks.map((b) => withTarget(b, false)) : data.blocks;
      const next = { ...data, blocks: [...others, block] };
      return target ? clampExit(next) : next;
    }
  }
  return data;
}

function withTarget(block: Block, target: boolean): Block {
  if (target === !!block.target) return block;
  const { target: _, ...rest } = block;
  return target ? { ...rest, target: true } : rest;
}

/** Whether `block` lies on the board without overlapping any block except `ignore`. */
function fits(data: KlotskiData, block: Block, ignore: number): boolean {
  if (block.x < 0 || block.y < 0 || block.x + block.w > data.width || block.y + block.h > data.height) return false;
  return data.blocks.every(
    (other, i) =>
      i === ignore ||
      other.x >= block.x + block.w ||
      block.x >= other.x + other.w ||
      other.y >= block.y + block.h ||
      block.y >= other.y + other.h,
  );
}

function nextId(data: KlotskiData): string {
  const used = new Set(data.blocks.map((b) => b.id));
  let n = data.blocks.length;
  while (used.has(`b${n}`)) n++;
  return `b${n}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}
