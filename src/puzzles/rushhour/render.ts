import { html, nothing, svg } from "lit-html";
import { detailOn } from "../../core/puzzle-theme.ts";
import type { PuzzleTheme } from "../../core/puzzle-theme.ts";
import type { PlayContext } from "../../core/types.ts";
import { t } from "../../i18n/t.ts";
import { CELL } from "../../ui/components/grid-editor.ts";
import { paletteCss, paletteStyle } from "../../ui/palette.ts";
import type { Palette } from "../../ui/palette.ts";
import { previewSvg } from "../../ui/preview.ts";
import { blockOrigin, initState, moveRange } from "./logic.ts";
import type { Block, RushHourData, RushHourMove, RushHourState } from "./logic.ts";

type Ctx = PlayContext<RushHourData, RushHourState, RushHourMove>;

const PAD = 24; // margin around the board for the exit marker
const INSET = 6; // gap between blocks and cell borders

// Colors per role (M29): defaults for light and dark, and where a puzzle theme's colors go.
export const PALETTE: Palette = {
  scope: ".rh",
  vars: {
    "--rh-board": { light: "#e4e1d8", dark: "#2a2c31", theme: "board" },
    "--rh-line": { light: "#cfcbc0", dark: "#3a3d44", theme: "line" },
    "--rh-block": { light: "#62758c", dark: "#6a7d93", theme: "piece" },
    "--rh-block-alt": { light: "#866a4c", dark: "#8f7659", theme: "accent" },
    "--rh-target": { light: "#d6453d", dark: "#ef5b52", theme: "target" },
    "--rh-mark": { light: "rgba(255, 255, 255, 0.85)", dark: "rgba(255, 255, 255, 0.85)", theme: (c) => detailOn(c.target) },
  },
};

// Scoped to the SVG via class names.
const STYLE = svg`<style>
  ${paletteCss(PALETTE)}
  .rh-board { fill: var(--rh-board); }
  .rh-line { stroke: var(--rh-line); stroke-width: 2; }
  .rh-exit { fill: var(--rh-target); opacity: 0.5; }
  .rh-block { cursor: grab; }
  .rh-face { fill: var(--rh-block); }
  .rh-block.v .rh-face { fill: var(--rh-block-alt); }
  .rh-block.target .rh-face { fill: var(--rh-target); }
  /* The target block also differs in shape: an arrow towards the exit (color is never the only difference). */
  .rh-mark { fill: none; stroke: var(--rh-mark); stroke-width: 8; stroke-linecap: round; stroke-linejoin: round; pointer-events: none; }
  .rh-block.dragging { cursor: grabbing; filter: brightness(1.1); }
  .rh-block.static { cursor: inherit; }
  .rh-block.problem .rh-face { stroke: var(--danger, #c6362f); stroke-width: 8; stroke-dasharray: 16 10; }
</style>`;

export function renderPlay(ctx: Ctx) {
  const { data } = ctx;
  const w = data.width * CELL;
  const h = data.height * CELL;
  return html`
    <svg
      viewBox="${-PAD} ${-PAD} ${w + 2 * PAD} ${h + 2 * PAD}"
      role="group"
      aria-label=${t("rushHourBoard")}
    >
      ${boardLayers(data, ctx.state, { ctx, theme: ctx.theme })}
    </svg>
  `;
}

/**
 * Board, exit and blocks in board units. With `ctx` blocks can be dragged;
 * `problemBlocks` are highlighted (editor).
 */
export function boardLayers(
  data: RushHourData,
  state: RushHourState,
  options: { ctx?: Ctx; problemBlocks?: ReadonlySet<number>; theme?: PuzzleTheme },
) {
  const { ctx, problemBlocks } = options;
  // The group carries the color variables, so the layers work inside any <svg> (play view or grid editor).
  return svg`<g class="rh" style=${paletteStyle(PALETTE, options.theme)}>
    ${STYLE}
    <rect class="rh-board" x="0" y="0" width=${data.width * CELL} height=${data.height * CELL} rx="12"></rect>
    ${gridLines(data)} ${exitMarker(data)}
    ${data.blocks.map((block, i) => {
      const origin = blockOrigin(data, state, i);
      const cols = block.axis === "h" ? block.length : 1;
      const rows = block.axis === "v" ? block.length : 1;
      const classes = [
        "rh-block",
        block.axis,
        block.target ? "target" : "",
        ctx ? "" : "static",
        problemBlocks?.has(i) ? "problem" : "",
      ].join(" ");
      const width = cols * CELL - 2 * INSET;
      const height = rows * CELL - 2 * INSET;
      return svg`<g
        class=${classes}
        tabindex=${ctx ? 0 : nothing}
        role=${ctx ? "button" : nothing}
        aria-label=${ctx ? blockLabel(block, origin) : nothing}
        @keydown=${ctx ? (e: KeyboardEvent) => keyMove(e, ctx, i) : null}
        @blur=${ctx ? (e: FocusEvent) => keySlide?.block === i && putDown(e.currentTarget as SVGGraphicsElement, ctx) : null}
        @pointerdown=${ctx ? (e: PointerEvent) => startDrag(e, ctx, i) : null}
        @pointermove=${ctx ? moveDrag : null}
        @pointerup=${ctx ? (e: PointerEvent) => endDrag(e, ctx) : null}
        @pointercancel=${ctx ? cancelDrag : null}
      >
        <rect class="rh-face" x=${origin.x * CELL + INSET} y=${origin.y * CELL + INSET} width=${width} height=${height} rx="16"></rect>
        ${block.target ? exitArrow(origin.x * CELL + INSET + width / 2, origin.y * CELL + INSET + height / 2, data.exit.side) : null}
      </g>`;
    })}
  </g>`;
}

const ARROW_TURN = { E: 0, S: 90, W: 180, N: 270 } as const;

/** A chevron pointing towards the exit, centered on (cx, cy). */
function exitArrow(cx: number, cy: number, side: keyof typeof ARROW_TURN) {
  return svg`<path class="rh-mark" d="M ${cx - 7} ${cy - 15} L ${cx + 8} ${cy} L ${cx - 7} ${cy + 15}"
    transform="rotate(${ARROW_TURN[side]} ${cx} ${cy})"></path>`;
}

function blockLabel(block: Block, origin: { x: number; y: number }) {
  return t(block.target ? "rhTargetLabel" : "rhBlockLabel", {
    axis: t(block.axis === "h" ? "rhHorizontal" : "rhVertical"),
    column: origin.x + 1,
    row: origin.y + 1,
  });
}

// Keyboard works like dragging: arrow keys slide the block (preview), Enter, Space or leaving
// the block puts it down as one move, Escape cancels. So keyboard players get the same move count.
const KEY_DELTA: Record<string, { axis: "h" | "v"; delta: number }> = {
  ArrowLeft: { axis: "h", delta: -1 },
  ArrowRight: { axis: "h", delta: 1 },
  ArrowUp: { axis: "v", delta: -1 },
  ArrowDown: { axis: "v", delta: 1 },
};

let keySlide: { block: number; offset: number } | null = null;

function keyMove(e: KeyboardEvent, ctx: Ctx, block: number) {
  const element = e.currentTarget as SVGGraphicsElement;
  const sliding = keySlide?.block === block ? keySlide : null;
  if (e.key === "Escape" && sliding) {
    keySlide = null;
    resetDrag(element);
    return;
  }
  if ((e.key === "Enter" || e.key === " ") && sliding) {
    e.preventDefault();
    putDown(element, ctx);
    return;
  }
  const key = KEY_DELTA[e.key];
  if (!key) return;
  e.preventDefault();
  if (ctx.data.blocks[block]!.axis !== key.axis || drag) return;
  const range = moveRange(ctx.data, ctx.state, block);
  const offset = (sliding?.offset ?? 0) + key.delta;
  if (offset < range.min || offset > range.max) return;
  keySlide = { block, offset };
  const [dx, dy] = key.axis === "h" ? [offset * CELL, 0] : [0, offset * CELL];
  element.setAttribute("transform", `translate(${dx} ${dy})`);
  element.classList.add("dragging");
}

function putDown(element: SVGGraphicsElement, ctx: Ctx) {
  if (!keySlide) return;
  const { block, offset } = keySlide;
  keySlide = null;
  element.removeAttribute("transform");
  element.classList.remove("dragging");
  if (offset !== 0) ctx.dispatch({ block, delta: offset });
}

function gridLines(data: RushHourData) {
  const lines = [];
  for (let x = 1; x < data.width; x++) {
    lines.push(svg`<line class="rh-line" x1=${x * CELL} y1="0" x2=${x * CELL} y2=${data.height * CELL}></line>`);
  }
  for (let y = 1; y < data.height; y++) {
    lines.push(svg`<line class="rh-line" x1="0" y1=${y * CELL} x2=${data.width * CELL} y2=${y * CELL}></line>`);
  }
  return lines;
}

function exitMarker(data: RushHourData) {
  const { side, index } = data.exit;
  const along = index * CELL + INSET;
  const span = CELL - 2 * INSET;
  const [x, y, width, height] =
    side === "E" ? [data.width * CELL, along, PAD, span]
    : side === "W" ? [-PAD, along, PAD, span]
    : side === "N" ? [along, -PAD, span, PAD]
    : [along, data.height * CELL, span, PAD];
  return svg`<rect class="rh-exit" x=${x} y=${y} width=${width} height=${height} rx="6"></rect>`;
}

// --- Dragging: the block follows the pointer along its axis and snaps to a cell on release. ---

type Drag = {
  pointerId: number;
  block: number;
  axis: "h" | "v";
  start: number; // pointer coordinate along the axis, in board units
  min: number; // allowed offset range in board units
  max: number;
  offset: number;
};

let drag: Drag | null = null;

function pointerCoord(e: PointerEvent, axis: "h" | "v"): number {
  const element = e.currentTarget as SVGGraphicsElement;
  const matrix = element.ownerSVGElement?.getScreenCTM();
  if (!matrix) return 0;
  const point = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
  return axis === "h" ? point.x : point.y;
}

function startDrag(e: PointerEvent, ctx: Ctx, block: number) {
  if (drag || !e.isPrimary || e.button !== 0) return;
  const element = e.currentTarget as SVGGraphicsElement;
  const axis = ctx.data.blocks[block]!.axis;
  const range = moveRange(ctx.data, ctx.state, block);
  element.setPointerCapture(e.pointerId);
  element.classList.add("dragging");
  drag = {
    pointerId: e.pointerId,
    block,
    axis,
    start: pointerCoord(e, axis),
    min: range.min * CELL,
    max: range.max * CELL,
    offset: 0,
  };
  e.preventDefault();
}

function moveDrag(e: PointerEvent) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const raw = pointerCoord(e, drag.axis) - drag.start;
  drag.offset = Math.min(drag.max, Math.max(drag.min, raw));
  const [dx, dy] = drag.axis === "h" ? [drag.offset, 0] : [0, drag.offset];
  (e.currentTarget as SVGGraphicsElement).setAttribute("transform", `translate(${dx} ${dy})`);
}

function endDrag(e: PointerEvent, ctx: Ctx) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const delta = Math.round(drag.offset / CELL);
  const block = drag.block;
  resetDrag(e.currentTarget as SVGGraphicsElement);
  if (delta !== 0) ctx.dispatch({ block, delta });
}

function cancelDrag(e: PointerEvent) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  resetDrag(e.currentTarget as SVGGraphicsElement);
}

function resetDrag(element: SVGGraphicsElement) {
  element.removeAttribute("transform");
  element.classList.remove("dragging");
  drag = null;
}

/** Card preview (M32): the starting position. */
export function renderPreview(data: RushHourData, theme: PuzzleTheme | undefined) {
  return previewSvg([-PAD, -PAD, data.width * CELL + 2 * PAD, data.height * CELL + 2 * PAD], boardLayers(data, initState(data), { theme }));
}
