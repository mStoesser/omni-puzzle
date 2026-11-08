import { html, nothing, svg } from "lit-html";
import { detailOn, mix } from "../../core/puzzle-theme.ts";
import type { PuzzleTheme } from "../../core/puzzle-theme.ts";
import type { PlayContext } from "../../core/types.ts";
import { t } from "../../i18n/t.ts";
import { CELL } from "../../ui/components/grid-editor.ts";
import { paletteCss, paletteStyle } from "../../ui/palette.ts";
import type { Palette } from "../../ui/palette.ts";
import { blockOrigin, exitSpan, reachable } from "./logic.ts";
import type { Block, KlotskiData, KlotskiMove, KlotskiState } from "./logic.ts";

type Ctx = PlayContext<KlotskiData, KlotskiState, KlotskiMove>;
type Point = { x: number; y: number };

const PAD = 24; // margin around the board for the exit marker
const INSET = 5; // gap between blocks and cell borders

// Colors per role (M29): defaults for light and dark, and where a puzzle theme's colors go.
export const PALETTE: Palette = {
  scope: ".kl",
  vars: {
    "--kl-board": { light: "#e6dccb", dark: "#2a2c31", theme: "board" },
    "--kl-line": { light: "#d4c8b3", dark: "#3a3d44", theme: "line" },
    "--kl-small": { light: "#a7794a", dark: "#b8895a", theme: "piece" },
    "--kl-long": { light: "#8b6440", dark: "#9a7350", theme: (c) => mix(c.piece, c.accent, 0.5) },
    "--kl-big": { light: "#6f5136", dark: "#7f6045", theme: "accent" },
    "--kl-target": { light: "#d6453d", dark: "#ef5b52", theme: "target" },
    "--kl-edge": { light: "rgba(0, 0, 0, 0.18)", dark: "rgba(0, 0, 0, 0.3)", theme: () => "rgba(0, 0, 0, 0.2)" },
    "--kl-mark": { light: "rgba(255, 255, 255, 0.85)", dark: "rgba(255, 255, 255, 0.85)", theme: (c) => detailOn(c.target) },
  },
};

const STYLE = svg`<style>
  ${paletteCss(PALETTE)}
  .kl-board { fill: var(--kl-board); }
  .kl-line { stroke: var(--kl-line); stroke-width: 2; }
  .kl-exit { fill: var(--kl-target); opacity: 0.5; }
  .kl-block { transition: transform 0.12s ease-out; cursor: grab; }
  .kl-block.static { cursor: inherit; transition: none; }
  .kl-block.dragging { transition: transform 0.05s linear; cursor: grabbing; filter: brightness(1.1); }
  .kl-face { fill: var(--kl-small); stroke: var(--kl-edge); stroke-width: 4; }
  .kl-block.long .kl-face { fill: var(--kl-long); }
  .kl-block.big .kl-face { fill: var(--kl-big); }
  .kl-block.target .kl-face { fill: var(--kl-target); }
  /* The target block also differs in shape: an arrow towards the exit (color is never the only difference). */
  .kl-mark { fill: none; stroke: var(--kl-mark); stroke-width: 8; stroke-linecap: round; stroke-linejoin: round; pointer-events: none; }
  .kl-block.problem .kl-face { stroke: var(--danger, #c6362f); stroke-width: 8; stroke-dasharray: 16 10; }
  @media (prefers-reduced-motion: reduce) {
    .kl-block, .kl-block.dragging { transition: none; }
  }
</style>`;

export function renderPlay(ctx: Ctx) {
  const { data, state } = ctx;
  const w = data.width * CELL;
  const h = data.height * CELL;
  const positions = data.blocks.map((_, i) => blockOrigin(data, state, i));
  return html`
    <svg viewBox="${-PAD} ${-PAD} ${w + 2 * PAD} ${h + 2 * PAD}" role="group" aria-label=${t("klotskiBoard")}>
      ${boardLayers(data, positions, { ctx, theme: ctx.theme })}
    </svg>
  `;
}

/**
 * Board, exit and blocks in board units, with every block's top-left cell from `positions`.
 * With `ctx` blocks can be dragged and moved by keyboard; `problemBlocks` are highlighted (editor).
 */
export function boardLayers(
  data: KlotskiData,
  positions: readonly Point[],
  options: { ctx?: Ctx; problemBlocks?: ReadonlySet<number>; theme?: PuzzleTheme },
) {
  const { ctx, problemBlocks } = options;
  // The group carries the color variables, so the layers work inside any <svg> (play view or grid editor).
  return svg`<g class="kl" style=${paletteStyle(PALETTE, options.theme)}>
    ${STYLE}
    <rect class="kl-board" x="0" y="0" width=${data.width * CELL} height=${data.height * CELL} rx="12"></rect>
    ${gridLines(data)} ${exitMarker(data)}
    ${data.blocks.map((block, i) => {
      const at = positions[i]!;
      const classes = [
        "kl-block",
        sizeClass(block),
        block.target ? "target" : "",
        ctx ? "" : "static",
        problemBlocks?.has(i) ? "problem" : "",
      ].join(" ");
      return svg`<g
        class=${classes}
        style="transform: ${translate(at)}"
        tabindex=${ctx ? 0 : nothing}
        role=${ctx ? "button" : nothing}
        aria-label=${ctx ? blockLabel(block, at) : nothing}
        @keydown=${ctx ? (e: KeyboardEvent) => keyMove(e, ctx, i) : null}
        @blur=${ctx ? (e: FocusEvent) => keySlide?.block === i && putDown(e.currentTarget as SVGGElement, ctx) : null}
        @pointerdown=${ctx ? (e: PointerEvent) => startDrag(e, ctx, i) : null}
        @pointermove=${ctx ? moveDrag : null}
        @pointerup=${ctx ? (e: PointerEvent) => endDrag(e, ctx) : null}
        @pointercancel=${ctx ? cancelDrag : null}
      >
        <rect class="kl-face" x=${INSET} y=${INSET} width=${block.w * CELL - 2 * INSET} height=${block.h * CELL - 2 * INSET} rx="14"></rect>
        ${block.target ? exitArrow((block.w * CELL) / 2, (block.h * CELL) / 2, data.exit.side) : null}
      </g>`;
    })}
  </g>`;
}

const ARROW_TURN = { E: 0, S: 90, W: 180, N: 270 } as const;

/** A chevron pointing towards the exit, centered on (cx, cy) in the block's own coordinates. */
function exitArrow(cx: number, cy: number, side: keyof typeof ARROW_TURN) {
  return svg`<path class="kl-mark" d="M ${cx - 7} ${cy - 15} L ${cx + 8} ${cy} L ${cx - 7} ${cy + 15}"
    transform="rotate(${ARROW_TURN[side]} ${cx} ${cy})"></path>`;
}

function sizeClass(block: Block): string {
  if (block.w === 2 && block.h === 2) return "big";
  return block.w === 2 || block.h === 2 ? "long" : "small";
}

function translate(p: Point): string {
  return `translate(${p.x * CELL}px, ${p.y * CELL}px)`;
}

function blockLabel(block: Block, at: Point) {
  return t(block.target ? "klTargetLabel" : "klBlockLabel", {
    size: `${block.w} × ${block.h}`,
    column: at.x + 1,
    row: at.y + 1,
  });
}

function gridLines(data: KlotskiData) {
  const lines = [];
  for (let x = 1; x < data.width; x++) {
    lines.push(svg`<line class="kl-line" x1=${x * CELL} y1="0" x2=${x * CELL} y2=${data.height * CELL}></line>`);
  }
  for (let y = 1; y < data.height; y++) {
    lines.push(svg`<line class="kl-line" x1="0" y1=${y * CELL} x2=${data.width * CELL} y2=${y * CELL}></line>`);
  }
  return lines;
}

/** The exit spans as many cells as the target block is wide (north/south) or high (east/west). */
function exitMarker(data: KlotskiData) {
  const { side, index } = data.exit;
  const along = index * CELL + INSET;
  const span = exitSpan(data) * CELL - 2 * INSET;
  const [x, y, width, height] =
    side === "E" ? [data.width * CELL, along, PAD, span]
    : side === "W" ? [-PAD, along, PAD, span]
    : side === "N" ? [along, -PAD, span, PAD]
    : [along, data.height * CELL, span, PAD];
  return svg`<rect class="kl-exit" x=${x} y=${y} width=${width} height=${height} rx="6"></rect>`;
}

// --- Moving a block: by dragging or by keyboard; either way one put-down is one move. ---

/** Reachable top-left cells of a block (including its start), as "x,y". */
function reachableSet(ctx: Ctx, block: number): Set<string> {
  const { data, state } = ctx;
  const cells = [state.pos[block]!, ...reachable(data, state, block)];
  return new Set(cells.map((p) => `${p % data.width},${Math.floor(p / data.width)}`));
}

function show(element: SVGGElement, p: Point) {
  element.style.transform = translate(p);
}

function finish(element: SVGGElement, ctx: Ctx, block: number, from: Point, to: Point) {
  element.classList.remove("dragging");
  if (to.x === from.x && to.y === from.y) {
    show(element, from);
    return;
  }
  ctx.dispatch({ block, x: to.x, y: to.y });
}

// Keyboard works like dragging: arrow keys move the block one cell at a time over free cells (preview),
// Enter, Space or leaving the block puts it down as one move, Escape cancels.
const KEY_STEP: Record<string, Point> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

let keySlide: { block: number; from: Point; at: Point; reach: Set<string> } | null = null;

function keyMove(e: KeyboardEvent, ctx: Ctx, block: number) {
  const element = e.currentTarget as SVGGElement;
  const sliding = keySlide?.block === block ? keySlide : null;
  if (e.key === "Escape" && sliding) {
    keySlide = null;
    element.classList.remove("dragging");
    show(element, sliding.from);
    return;
  }
  if ((e.key === "Enter" || e.key === " ") && sliding) {
    e.preventDefault();
    putDown(element, ctx);
    return;
  }
  const step = KEY_STEP[e.key];
  if (!step) return;
  e.preventDefault();
  if (drag) return;
  const from = blockOrigin(ctx.data, ctx.state, block);
  const slide = sliding ?? { block, from, at: from, reach: reachableSet(ctx, block) };
  const next = { x: slide.at.x + step.x, y: slide.at.y + step.y };
  if (!slide.reach.has(`${next.x},${next.y}`)) return;
  keySlide = { ...slide, at: next };
  element.classList.add("dragging");
  show(element, next);
}

function putDown(element: SVGGElement, ctx: Ctx) {
  if (!keySlide) return;
  const { block, from, at } = keySlide;
  keySlide = null;
  finish(element, ctx, block, from, at);
}

// Dragging: the block snaps to the reachable position nearest to the pointer and slides smoothly
// towards a neighbouring reachable position, so it can be led around corners.

type Drag = {
  pointerId: number;
  block: number;
  from: Point; // top-left cell at the start
  start: Point; // pointer in board units at the start
  reach: Set<string>;
  at: Point; // current snapped position
};

let drag: Drag | null = null;

function pointerPoint(e: PointerEvent): Point | null {
  const element = e.currentTarget as SVGGraphicsElement;
  const matrix = element.ownerSVGElement?.getScreenCTM();
  if (!matrix) return null;
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
  return { x: p.x / CELL, y: p.y / CELL };
}

function startDrag(e: PointerEvent, ctx: Ctx, block: number) {
  if (drag || keySlide || !e.isPrimary || e.button !== 0) return;
  const start = pointerPoint(e);
  if (!start) return;
  const element = e.currentTarget as SVGGElement;
  element.setPointerCapture(e.pointerId);
  element.classList.add("dragging");
  const from = blockOrigin(ctx.data, ctx.state, block);
  drag = { pointerId: e.pointerId, block, from, start, reach: reachableSet(ctx, block), at: from };
  e.preventDefault();
}

function moveDrag(e: PointerEvent) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const p = pointerPoint(e);
  if (!p) return;
  const wanted = { x: drag.from.x + p.x - drag.start.x, y: drag.from.y + p.y - drag.start.y };
  drag.at = nearest(drag.reach, wanted, drag.at);
  // Partial offset towards the wanted position along the main axis, if the next cell there is reachable.
  const dx = wanted.x - drag.at.x;
  const dy = wanted.y - drag.at.y;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const d = horizontal ? dx : dy;
  const sign = Math.sign(d);
  const neighbour = horizontal ? `${drag.at.x + sign},${drag.at.y}` : `${drag.at.x},${drag.at.y + sign}`;
  const offset = sign !== 0 && drag.reach.has(neighbour) ? Math.min(Math.abs(d), 0.5) * sign : 0;
  show(e.currentTarget as SVGGElement, horizontal ? { x: drag.at.x + offset, y: drag.at.y } : { x: drag.at.x, y: drag.at.y + offset });
}

/** The reachable position closest to `wanted`; on a tie the current one stays. */
function nearest(reach: Set<string>, wanted: Point, current: Point): Point {
  let best = current;
  let bestDistance = (current.x - wanted.x) ** 2 + (current.y - wanted.y) ** 2;
  for (const key of reach) {
    const [x, y] = key.split(",").map(Number) as [number, number];
    const distance = (x - wanted.x) ** 2 + (y - wanted.y) ** 2;
    if (distance < bestDistance - 1e-9) {
      best = { x, y };
      bestDistance = distance;
    }
  }
  return best;
}

function endDrag(e: PointerEvent, ctx: Ctx) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const { block, from, at } = drag;
  drag = null;
  finish(e.currentTarget as SVGGElement, ctx, block, from, at);
}

function cancelDrag(e: PointerEvent) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const element = e.currentTarget as SVGGElement;
  element.classList.remove("dragging");
  show(element, drag.from);
  drag = null;
}
