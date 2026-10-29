import { html, svg } from "lit-html";
import type { PlayContext } from "../../core/types.ts";
import { t } from "../../i18n/t.ts";
import { CELL } from "../../ui/components/grid-editor.ts";
import { blockOrigin, moveRange } from "./logic.ts";
import type { RushHourData, RushHourMove, RushHourState } from "./logic.ts";

type Ctx = PlayContext<RushHourData, RushHourState, RushHourMove>;

const PAD = 24; // margin around the board for the exit marker
const INSET = 6; // gap between blocks and cell borders

// Scoped to the SVG via class names; light and dark variants.
const STYLE = svg`<style>
  .rh { --rh-board: #e4e1d8; --rh-line: #cfcbc0; --rh-block: #7b8fa6; --rh-block-alt: #a1876a; --rh-target: #d6453d; }
  @media (prefers-color-scheme: dark) {
    .rh { --rh-board: #2a2c31; --rh-line: #3a3d44; --rh-block: #6a7d93; --rh-block-alt: #8f7659; --rh-target: #ef5b52; }
  }
  .rh-board { fill: var(--rh-board); }
  .rh-line { stroke: var(--rh-line); stroke-width: 2; }
  .rh-exit { fill: var(--rh-target); opacity: 0.5; }
  .rh-block { fill: var(--rh-block); cursor: grab; }
  .rh-block.v { fill: var(--rh-block-alt); }
  .rh-block.target { fill: var(--rh-target); }
  .rh-block.dragging { cursor: grabbing; filter: brightness(1.1); }
  .rh-block.static { cursor: inherit; }
  .rh-block.problem { stroke: var(--danger, #c6362f); stroke-width: 8; stroke-dasharray: 16 10; }
</style>`;

export function renderPlay(ctx: Ctx) {
  const { data } = ctx;
  const w = data.width * CELL;
  const h = data.height * CELL;
  return html`
    <svg
      viewBox="${-PAD} ${-PAD} ${w + 2 * PAD} ${h + 2 * PAD}"
      role="img"
      aria-label=${t("rushHourBoard")}
    >
      ${boardLayers(data, ctx.state, { ctx })}
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
  options: { ctx?: Ctx; problemBlocks?: ReadonlySet<number> },
) {
  const { ctx, problemBlocks } = options;
  // The group carries the color variables, so the layers work inside any <svg> (play view or grid editor).
  return svg`<g class="rh">
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
      return svg`<rect
        class=${classes}
        x=${origin.x * CELL + INSET}
        y=${origin.y * CELL + INSET}
        width=${cols * CELL - 2 * INSET}
        height=${rows * CELL - 2 * INSET}
        rx="16"
        @pointerdown=${ctx ? (e: PointerEvent) => startDrag(e, ctx, i) : null}
        @pointermove=${ctx ? moveDrag : null}
        @pointerup=${ctx ? (e: PointerEvent) => endDrag(e, ctx) : null}
        @pointercancel=${ctx ? cancelDrag : null}
      ></rect>`;
    })}
  </g>`;
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
