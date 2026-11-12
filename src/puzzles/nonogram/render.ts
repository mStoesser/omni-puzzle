import { html, svg } from "lit-html";
import { mix } from "../../core/puzzle-theme.ts";
import type { PuzzleTheme, ThemeColors } from "../../core/puzzle-theme.ts";
import type { PlayContext } from "../../core/types.ts";
import { t } from "../../i18n/t.ts";
import { paletteCss, paletteStyle } from "../../ui/palette.ts";
import type { Palette } from "../../ui/palette.ts";
import { iconSvg } from "../../ui/icons.ts";
import { previewSvg } from "../../ui/preview.ts";
import { TOOL_ICONS } from "../../ui/tool-icons.ts";
import { lineDone } from "./logic.ts";
import type { Mark, NonogramData, NonogramMove, NonogramState } from "./logic.ts";

type Ctx = PlayContext<NonogramData, NonogramState, NonogramMove>;

const U = 100; // board units per cell (clue cells have the same size)
/** Cell size with zoom: the minimum tap target. */
const ZOOM_PX = 44;
/** Clue numbers are narrower than cells: side by side (row clues) and one above the other (column clues). */
const CLUE_X = 0.7;
const CLUE_Y = 0.62;

// Colors per role (M29): defaults for light and dark, and where a puzzle theme's colors go.
const PAPER = { light: "#f6f3ec", dark: "#24272d", theme: "board" } as const;
const INK = { light: "#2b2f36", dark: "#e6e8ec", theme: "piece" } as const;
const LINE = { light: "#d6d0c3", dark: "#363a42", theme: "line" } as const;
const LINE5 = { light: "#9c968a", dark: "#6b707a", theme: (c: ThemeColors) => mix(c.line, c.piece, 0.4) };

export const PALETTE: Palette = {
  scope: ".ng",
  vars: {
    "--ng-ink": INK,
    "--ng-paper": PAPER,
    "--ng-line": LINE,
    "--ng-line5": LINE5,
    "--ng-cross": { light: "#8a857b", dark: "#80858f", theme: (c) => mix(c.piece, c.board, 0.45) },
    "--ng-clue": { light: "#2b2f36", dark: "#e6e8ec", theme: "piece" },
    "--ng-done": { light: "#b0aa9e", dark: "#5b606a", theme: (c) => mix(c.piece, c.board, 0.65) },
    "--ng-image": { light: "#3f6212", dark: "#b9db6a", theme: "done" },
  },
};

/** The picture in the grid editor uses some of the same colors. */
export const EDIT_PALETTE: Palette = {
  scope: ".ng-edit",
  vars: { "--ng-ink": INK, "--ng-paper": PAPER, "--ng-line": LINE, "--ng-line5": LINE5 },
};

// Styles for the HTML around the boards and for the SVGs.
const STYLE = html`<style>
  ${paletteCss(PALETTE)}
  .ng { display: grid; gap: var(--kk-space-2, 8px); width: 100%; }
  .ng-bar { display: flex; flex-wrap: wrap; gap: var(--kk-space-2, 8px); align-items: stretch; justify-content: center; }
  .ng-bar .tool > span { min-height: 44px; min-width: 88px; grid-auto-flow: column; }
  .ng-scroll { container-type: inline-size; overflow: auto; max-height: 70dvh; overscroll-behavior: contain; }
  /* A preview only shows: the page must scroll over it (game boards block swipes so they can be drawn on). */
  .ng.preview .ng-scroll { max-height: none; overflow: visible; overscroll-behavior: auto; }
  .ng.preview svg { touch-action: auto; }
  .ng-sheet { display: grid; grid-template-columns: auto auto; width: max-content; margin: 0 auto;
              --ng-cell: min(${ZOOM_PX}px, 100cqi / var(--ng-across)); }
  .ng:has(.ng-zoom input:checked) .ng-sheet { --ng-cell: ${ZOOM_PX}px; }
  .ng-sheet > svg { max-width: none; background: var(--ng-paper); }
  .ng-corner { position: sticky; top: 0; left: 0; z-index: 2; background: var(--ng-paper); }
  .ng-top { position: sticky; top: 0; z-index: 1; touch-action: pan-x pan-y; }
  .ng-left { position: sticky; left: 0; z-index: 1; touch-action: pan-x pan-y; }
  .ng-clue { fill: var(--ng-clue); font: 700 52px/1 var(--kk-font-display, system-ui), system-ui; text-anchor: middle;
             dominant-baseline: central; }
  .ng-clue.done { fill: var(--ng-done); }
  .ng-cell rect { fill: var(--ng-paper); }
  .ng-cell .ng-x { stroke: var(--ng-cross); stroke-width: 7; stroke-linecap: round; display: none; }
  .ng-cell.s-fill rect, .ng-cell[data-preview="#"] rect { fill: var(--ng-ink); }
  .ng-cell.s-cross .ng-x, .ng-cell[data-preview="x"] .ng-x { display: inline; }
  .ng-cell[data-preview="."] rect { fill: var(--ng-paper); }
  .ng-cell[data-preview="."] .ng-x { display: none; }
  .ng-cell[data-preview] rect { opacity: 0.7; }
  .ng-line { stroke: var(--ng-line); stroke-width: 3; }
  .ng-line.five { stroke: var(--ng-line5); stroke-width: 5; }
  .ng-cells.play .ng-cell { cursor: pointer; }
  .ng.solved .ng-cell .ng-x { display: none; }
  .ng.solved .ng-cell.s-fill rect { fill: var(--ng-image); transition: fill 0.4s ease-out; }
  .ng.solved .ng-line { stroke: transparent; transition: stroke 0.4s ease-out; }
  @media (prefers-reduced-motion: reduce) {
    .ng.solved .ng-cell.s-fill rect, .ng.solved .ng-line { transition: none; }
  }
</style>`;

export function renderPlay(ctx: Ctx) {
  const { data, state } = ctx;
  const solved = [...Array(data.height).keys()].every((y) => lineDone(data, state, "row", y)) &&
    [...Array(data.width).keys()].every((x) => lineDone(data, state, "col", x));
  const rowsDone = [...Array(data.height).keys()].filter((y) => lineDone(data, state, "row", y)).length;
  const colsDone = [...Array(data.width).keys()].filter((x) => lineDone(data, state, "col", x)).length;
  return html`
    <div class="ng ${solved ? "solved" : ""}" style=${paletteStyle(PALETTE, ctx.theme)}>
      ${STYLE}
      <div class="ng-bar">
        <fieldset class="ng-modes" style="display: contents">
          <legend class="visually-hidden">${t("ngMode")}</legend>
          <label class="tool"><input type="radio" name="ng-mode" value="#" checked /><span>${iconSvg(TOOL_ICONS.fill, 22)} ${t("ngModeFill")}</span></label>
          <label class="tool"><input type="radio" name="ng-mode" value="x" /><span>${iconSvg(TOOL_ICONS.cross, 22)} ${t("ngModeCross")}</span></label>
        </fieldset>
        <label class="tool ng-zoom"><input type="checkbox" /><span>${iconSvg(TOOL_ICONS.zoom, 22)} ${t("ngZoom")}</span></label>
      </div>
      ${sheet(data, state.cells, { ctx })}
      <p class="visually-hidden" aria-live="polite">${t("ngProgress", { rows: rowsDone, height: data.height, cols: colsDone, width: data.width })}</p>
    </div>
  `;
}

/**
 * Editor preview: the clues as players will see them, next to the drawn picture. Only for looking:
 * not tappable, and the page scrolls over it.
 */
export function cluePreview(data: NonogramData, image: readonly string[], theme?: PuzzleTheme) {
  return html`<div class="ng preview" style=${paletteStyle(PALETTE, theme)}>${STYLE}${sheet(data, image.join(""), { done: false })}</div>`;
}

/** Clues and cells. With `ctx` cells can be marked; `done` overrides which clues are greyed out. */
export function sheet(data: NonogramData, cells: string, options: { ctx?: Ctx; done?: boolean }) {
  const { ctx } = options;
  const state = { cells };
  const left = Math.max(1, ...data.rows.map((c) => c.length));
  const top = Math.max(1, ...data.cols.map((c) => c.length));
  const size = (cells: number) => `width: calc(var(--ng-cell) * ${cells}); height: auto`;
  const doneRow = (y: number) => options.done ?? lineDone(data, state, "row", y);
  const doneCol = (x: number) => options.done ?? lineDone(data, state, "col", x);
  return html`<div class="ng-scroll">
    <div class="ng-sheet" style="--ng-across: ${(left + 0.3) * CLUE_X + data.width}">
      <div class="ng-corner"></div>
      <svg class="ng-top" viewBox="0 0 ${data.width * U} ${(top + 0.3) * CLUE_Y * U}" style=${size(data.width)} aria-hidden="true">
        ${data.cols.map((clue, x) =>
          clue.map((n, k) => svg`<text class="ng-clue ${doneCol(x) ? "done" : ""}" x=${(x + 0.5) * U} y=${(top - clue.length + k + 0.65) * CLUE_Y * U}>${n}</text>`),
        )}
      </svg>
      <svg class="ng-left" viewBox="0 0 ${(left + 0.3) * CLUE_X * U} ${data.height * U}" style=${size((left + 0.3) * CLUE_X)} aria-hidden="true">
        ${data.rows.map((clue, y) =>
          clue.map((n, k) => svg`<text class="ng-clue ${doneRow(y) ? "done" : ""}" x=${(left - clue.length + k + 0.65) * CLUE_X * U} y=${(y + 0.5) * U}>${n}</text>`),
        )}
      </svg>
      <svg
        class="ng-cells ${ctx ? "play" : ""}"
        viewBox="0 0 ${data.width * U} ${data.height * U}"
        style=${size(data.width)}
        role="group"
        aria-label=${t("nonogramBoard")}
        @pointerdown=${ctx ? (e: PointerEvent) => startDrag(e, ctx) : null}
        @pointermove=${ctx ? (e: PointerEvent) => moveDrag(e, ctx) : null}
        @pointerup=${ctx ? (e: PointerEvent) => endDrag(e, ctx) : null}
        @pointercancel=${ctx ? cancelDrag : null}
      >
        ${[...cells].map((mark, i) => cell(data, i, mark, ctx))} ${gridLines(data)}
      </svg>
    </div>
  </div>`;
}

const STATE_CLASS: Record<string, string> = { "#": "s-fill", x: "s-cross", ".": "s-open" };

// Roving tabindex: only one cell is in the tab order; arrow keys move the focus, Enter or Space marks.
let focused = 0;

function cell(data: NonogramData, i: number, mark: string, ctx: Ctx | undefined) {
  const x = i % data.width;
  const y = Math.floor(i / data.width);
  const content = svg`<rect x=${x * U} y=${y * U} width=${U} height=${U}></rect>
    <path class="ng-x" d="M ${x * U + 28} ${y * U + 28} L ${x * U + 72} ${y * U + 72} M ${x * U + 72} ${y * U + 28} L ${x * U + 28} ${y * U + 72}"></path>`;
  if (!ctx) return svg`<g class="ng-cell ${STATE_CLASS[mark]}">${content}</g>`;
  if (focused >= data.width * data.height) focused = 0;
  return svg`<g
    class="ng-cell ${STATE_CLASS[mark]}"
    data-i=${i}
    role="button"
    tabindex=${i === focused ? 0 : -1}
    aria-label=${t("ngCell", {
      column: x + 1,
      row: y + 1,
      state: t(mark === "#" ? "ngFilled" : mark === "x" ? "ngCrossed" : "ngOpen"),
      rowClue: data.rows[y]!.join(" ") || "0",
      colClue: data.cols[x]!.join(" ") || "0",
    })}
    @keydown=${(e: KeyboardEvent) => keydown(e, ctx, i)}
  >${content}</g>`;
}

function gridLines(data: NonogramData) {
  const lines = [];
  for (let x = 1; x < data.width; x++) {
    lines.push(svg`<line class="ng-line ${x % 5 === 0 ? "five" : ""}" x1=${x * U} y1="0" x2=${x * U} y2=${data.height * U}></line>`);
  }
  for (let y = 1; y < data.height; y++) {
    lines.push(svg`<line class="ng-line ${y % 5 === 0 ? "five" : ""}" x1="0" y1=${y * U} x2=${data.width * U} y2=${y * U}></line>`);
  }
  return lines;
}

/** The selected mode ("#" fill or "x" cross) from the radio buttons next to the board. */
function mode(element: Element): Mark {
  const checked = element.closest(".ng")?.querySelector<HTMLInputElement>('input[name="ng-mode"]:checked');
  return checked?.value === "x" ? "x" : "#";
}

/** What touching a cell does: set the mode's mark, or clear the cell if it already has it. */
function action(cells: string, cell: number, mark: Mark): Mark {
  return cells[cell] === mark ? "." : mark;
}

// --- Dragging: the first cell decides the action; the drag locks to the row or column it leaves the cell in. ---

type Drag = {
  pointerId: number;
  start: { x: number; y: number };
  axis: "row" | "col" | null;
  mark: Mark;
  cells: number[];
};

let drag: Drag | null = null;

function pointerCell(e: PointerEvent, data: NonogramData): { x: number; y: number } | null {
  const matrix = (e.currentTarget as SVGSVGElement).getScreenCTM();
  if (!matrix) return null;
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
  const x = Math.floor(p.x / U);
  const y = Math.floor(p.y / U);
  return { x: Math.min(data.width - 1, Math.max(0, x)), y: Math.min(data.height - 1, Math.max(0, y)) };
}

function startDrag(e: PointerEvent, ctx: Ctx) {
  if (drag || !e.isPrimary || e.button !== 0) return;
  const start = pointerCell(e, ctx.data);
  if (!start) return;
  const svgElement = e.currentTarget as SVGSVGElement;
  svgElement.setPointerCapture(e.pointerId);
  const index = start.y * ctx.data.width + start.x;
  focused = index;
  drag = { pointerId: e.pointerId, start, axis: null, mark: action(ctx.state.cells, index, mode(svgElement)), cells: [index] };
  preview(svgElement, drag);
  e.preventDefault();
}

function moveDrag(e: PointerEvent, ctx: Ctx) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const to = pointerCell(e, ctx.data);
  if (!to) return;
  const { start } = drag;
  if (!drag.axis && (to.x !== start.x || to.y !== start.y)) {
    drag.axis = Math.abs(to.x - start.x) >= Math.abs(to.y - start.y) ? "row" : "col";
  }
  const w = ctx.data.width;
  const cells: number[] = [];
  if (drag.axis === "row") {
    for (let x = Math.min(start.x, to.x); x <= Math.max(start.x, to.x); x++) cells.push(start.y * w + x);
  } else if (drag.axis === "col") {
    for (let y = Math.min(start.y, to.y); y <= Math.max(start.y, to.y); y++) cells.push(y * w + start.x);
  } else {
    cells.push(start.y * w + start.x);
  }
  drag.cells = cells;
  preview(e.currentTarget as SVGSVGElement, drag);
}

function endDrag(e: PointerEvent, ctx: Ctx) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const { cells, mark } = drag;
  clearPreview(e.currentTarget as SVGSVGElement);
  drag = null;
  // Only cells that change; a drag that changes nothing is no move.
  const changing = cells.filter((c) => ctx.state.cells[c] !== mark);
  if (changing.length > 0) ctx.dispatch({ cells: changing, mark });
}

function cancelDrag(e: PointerEvent) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  clearPreview(e.currentTarget as SVGSVGElement);
  drag = null;
}

function preview(board: SVGSVGElement, current: Drag) {
  clearPreview(board);
  for (const c of current.cells) board.querySelector(`.ng-cell[data-i="${c}"]`)?.setAttribute("data-preview", current.mark);
}

function clearPreview(board: SVGSVGElement) {
  for (const element of board.querySelectorAll("[data-preview]")) element.removeAttribute("data-preview");
}

// --- Keyboard ---

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

function keydown(e: KeyboardEvent, ctx: Ctx, i: number) {
  const element = e.currentTarget as SVGElement;
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    focused = i;
    ctx.dispatch({ cells: [i], mark: action(ctx.state.cells, i, mode(element)) });
    return;
  }
  const arrow = ARROWS[e.key];
  if (!arrow) return;
  e.preventDefault();
  const { width, height } = ctx.data;
  const x = (i % width) + arrow[0];
  const y = Math.floor(i / width) + arrow[1];
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const next = element.ownerSVGElement?.querySelector<SVGElement>(`.ng-cell[data-i="${y * width + x}"]`);
  if (!next) return;
  element.setAttribute("tabindex", "-1");
  next.setAttribute("tabindex", "0");
  next.focus();
  focused = y * width + x;
}

/**
 * The picture for the grid editor (board units: 100 per cell, like the grid editor). `marked` cells get a dashed
 * frame, e.g. where two solutions of ambiguous clues differ.
 */
export function editorLayers(data: NonogramData, image: readonly string[], marked: ReadonlySet<number>, theme?: PuzzleTheme) {
  const cells = image.join("");
  return svg`<g class="ng-edit" style=${paletteStyle(EDIT_PALETTE, theme)}>
    <style>
      ${paletteCss(EDIT_PALETTE)}
      .ng-edit .ng-px { fill: var(--ng-paper); }
      .ng-edit .ng-px.on { fill: var(--ng-ink); }
      .ng-edit .ng-line { stroke: var(--ng-line); stroke-width: 3; }
      .ng-edit .ng-line.five { stroke: var(--ng-line5); stroke-width: 5; }
      .ng-edit .ng-mark { fill: none; stroke: var(--danger, #c6362f); stroke-width: 8; stroke-dasharray: 16 10; }
    </style>
    ${[...cells].map((c, i) => svg`<rect class="ng-px ${c === "#" ? "on" : ""}" x=${(i % data.width) * U} y=${Math.floor(i / data.width) * U} width=${U} height=${U}></rect>`)}
    ${gridLines(data)}
    ${[...marked].map((i) => svg`<rect class="ng-mark" x=${(i % data.width) * U + 8} y=${Math.floor(i / data.width) * U + 8} width=${U - 16} height=${U - 16} rx="10"></rect>`)}
  </g>`;
}

// Card preview (M32): the empty grid with a dot per clue number. The numbers themselves would be unreadable on a card.
const PREVIEW_STYLE = svg`<style>
  ${paletteCss(PALETTE)}
  .ng-pv-paper { fill: var(--ng-paper); }
  .ng-pv-cells { fill: var(--ng-paper); stroke: var(--ng-line5); stroke-width: 6; }
  .ng-pv-clue { fill: var(--ng-clue); }
  .ng-pv .ng-line { stroke: var(--ng-line); stroke-width: 3; }
  .ng-pv .ng-line.five { stroke: var(--ng-line5); stroke-width: 5; }
</style>`;

export function renderPreview(data: NonogramData, theme: PuzzleTheme | undefined) {
  const left = Math.max(1, ...data.rows.map((c) => c.length)) * CLUE_X * U;
  const top = Math.max(1, ...data.cols.map((c) => c.length)) * CLUE_Y * U;
  const dot = (x: number, y: number) => svg`<circle class="ng-pv-clue" cx=${x} cy=${y} r="18"></circle>`;
  const rowDots = data.rows.flatMap((clue, y) => clue.map((_, k) => dot(left - (clue.length - k - 0.5) * CLUE_X * U, top + (y + 0.5) * U)));
  const colDots = data.cols.flatMap((clue, x) => clue.map((_, k) => dot(left + (x + 0.5) * U, top - (clue.length - k - 0.5) * CLUE_Y * U)));
  const pad = 20;
  const w = left + data.width * U;
  const h = top + data.height * U;
  return previewSvg(
    [-pad, -pad, w + 2 * pad, h + 2 * pad],
    svg`<g class="ng ng-pv" style=${paletteStyle(PALETTE, theme)}>
      ${PREVIEW_STYLE}
      <rect class="ng-pv-paper" x=${-pad} y=${-pad} width=${w + 2 * pad} height=${h + 2 * pad}></rect>
      ${rowDots} ${colDots}
      <g transform="translate(${left} ${top})">
        <rect class="ng-pv-cells" width=${data.width * U} height=${data.height * U}></rect>
        ${gridLines(data)}
      </g>
    </g>`,
  );
}
