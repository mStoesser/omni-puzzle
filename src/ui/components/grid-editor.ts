import { html, svg } from "lit-html";
import type { TemplateResult } from "lit-html";
import { lineCells } from "../../core/grid.ts";
import type { Point } from "../../core/grid.ts";
import { t } from "../../i18n/t.ts";
import { tapCancel, tapEnd, tapStart } from "./tap.ts";

/** Board units per cell. Plugins draw their board content in this coordinate system. */
export const CELL = 100;

/**
 * `paint`: the tool paints while dragging over the board (walls, pixels …) instead of acting on a tap.
 * `group`: a heading shown before the first tool of each group, so long palettes stay clear (e.g. laser).
 */
export type PaletteItem = { id: string; label: string; icon: string; paint?: boolean; group?: string };

/** A further number in the settings next to width and height (e.g. the laser's inventory). */
export type SettingStepper = { label: string; value: number; min: number; max: number; set(value: number): void };

export type GridEditorOptions = {
  width: number;
  height: number;
  /** Adds a tappable ring of cells around the board (x/y = -1 and width/height), e.g. for exits. */
  ring: boolean;
  size: { min: number; max: number; onResize(width: number, height: number): void };
  /** Shown after width and height. */
  settings?: readonly SettingStepper[];
  palette: readonly PaletteItem[];
  /** SVG content in board units, drawn below the tap layer. */
  board: unknown;
  label: string;
  onTap(tool: string, x: number, y: number): void;
  /**
   * For paint tools: apply the tool to these board cells, in order. All calls of one stroke share `group`,
   * so the plugin passes it to `EditorContext.update` and the stroke becomes one undo step.
   * Keyboard use (Enter) still goes through onTap.
   */
  onPaint?(tool: string, cells: readonly Point[], group: number): void;
  /** Content of a cell for screen readers, e.g. "Spiegel, drehbar". Empty = nothing there. */
  describe?(x: number, y: number): string;
};

/**
 * Generic grid editor: size controls, tool palette and a tap layer over the plugin's board.
 * The selected tool lives in native radio buttons, so it needs no app state.
 */
export function gridEditor(options: GridEditorOptions): TemplateResult {
  const { width: w, height: h, ring } = options;
  const margin = ring ? CELL : 0;
  const first = ring ? -1 : 0;
  const cells: TemplateResult[] = [];
  for (let y = first; y < h - first; y++) {
    for (let x = first; x < w - first; x++) {
      const inRing = x < 0 || y < 0 || x >= w || y >= h;
      const corner = (x < 0 || x >= w) && (y < 0 || y >= h);
      if (corner) continue;
      const content = options.describe?.(x, y) ?? "";
      const position = t(inRing ? "geRingCell" : "geCell", { column: x + 1, row: y + 1 });
      cells.push(svg`<rect
        class="ge-cell ${inRing ? "ring" : ""}"
        data-x=${x}
        data-y=${y}
        role="button"
        tabindex=${x === 0 && y === 0 ? 0 : -1}
        aria-label=${content ? `${position}: ${content}` : position}
        @keydown=${(e: KeyboardEvent) => keydown(e, options, x, y)}
        x=${x * CELL + (inRing ? 8 : 0)}
        y=${y * CELL + (inRing ? 8 : 0)}
        width=${CELL - (inRing ? 16 : 0)}
        height=${CELL - (inRing ? 16 : 0)}
        rx=${inRing ? 12 : 0}
        @pointerdown=${tapStart}
        @pointerup=${(e: PointerEvent) => tapEnd(e) && tapped(e, options, x, y)}
        @pointercancel=${tapCancel}
      ></rect>`);
    }
  }

  return html`
    <form class="grid-editor" @submit=${(e: Event) => e.preventDefault()}>
      <fieldset class="palette">
        <legend class="visually-hidden">${t("tool")}</legend>
        ${options.palette.map(
          (item, i) => html`
            ${item.group !== undefined && item.group !== options.palette[i - 1]?.group
              ? html`<span class="palette-group">${item.group}</span>`
              : null}
            <label class="tool">
              <input type="radio" name="tool" value=${item.id} ?checked=${i === 0} />
              <span><span aria-hidden="true">${item.icon}</span> ${item.label}</span>
            </label>
          `,
        )}
      </fieldset>
      <svg
        class="ge-board"
        viewBox="${-margin} ${-margin} ${w * CELL + 2 * margin} ${h * CELL + 2 * margin}"
        @pointerdown=${(e: PointerEvent) => paintStart(e, options)}
        @pointermove=${(e: PointerEvent) => paintMove(e, options)}
        @pointerup=${paintEnd}
        @pointercancel=${paintEnd}
        @lostpointercapture=${paintEnd}
        role="group"
        aria-label="${options.label}. ${t("geKeyboardHint")}"
      >
        ${options.board} ${cells}
      </svg>
      <div class="size-controls">
        ${stepper(t("width"), w, options.size, (v) => options.size.onResize(v, h))}
        ${stepper(t("height"), h, options.size, (v) => options.size.onResize(w, v))}
        ${options.settings?.map((s) => stepper(s.label, s.value, s, (v) => s.set(v)))}
      </div>
    </form>
  `;
}

function stepper(label: string, value: number, size: { min: number; max: number }, set: (value: number) => void) {
  return html`
    <div class="stepper" role="group" aria-label=${label}>
      <span>${label}</span>
      <button
        type="button"
        class="secondary"
        aria-label=${t("smaller", { dimension: label })}
        ?disabled=${value <= size.min}
        @click=${() => set(value - 1)}
      >
        −
      </button>
      <output>${value}</output>
      <button
        type="button"
        class="secondary"
        aria-label=${t("larger", { dimension: label })}
        ?disabled=${value >= size.max}
        @click=${() => set(value + 1)}
      >
        +
      </button>
    </div>
  `;
}

function selectedTool(e: Event): string | null {
  const form = (e.currentTarget as Element).closest("form");
  const tool = form ? new FormData(form).get("tool") : null;
  return typeof tool === "string" ? tool : null;
}

function tapped(e: Event, options: GridEditorOptions, x: number, y: number) {
  const tool = selectedTool(e);
  if (tool !== null) options.onTap(tool, x, y);
}

// Painting: with a paint tool, pressing applies it at once and dragging applies it to every cell the
// pointer crosses (gaps between pointer events are filled along a line). Each cell counts once per stroke.
let stroke: { pointerId: number; tool: string; group: number; last: Point; visited: Set<string> } | null = null;
let strokes = 0;

/** The cell under the pointer in board coordinates, also outside the board. */
function pointerCell(e: PointerEvent): Point | null {
  const matrix = (e.currentTarget as SVGSVGElement).getScreenCTM();
  if (!matrix) return null;
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
  return { x: Math.floor(p.x / CELL), y: Math.floor(p.y / CELL) };
}

/** Only board cells take paint, not the ring. */
function onBoard(cell: Point, options: GridEditorOptions): boolean {
  return cell.x >= 0 && cell.y >= 0 && cell.x < options.width && cell.y < options.height;
}

function paintStart(e: PointerEvent, options: GridEditorOptions) {
  if (!e.isPrimary || e.button !== 0 || !options.onPaint) return;
  const tool = selectedTool(e);
  if (!options.palette.some((item) => item.id === tool && item.paint)) return;
  const cell = pointerCell(e);
  if (!cell || tool === null || !onBoard(cell, options)) return;
  tapCancel(); // the cell's tap handlers saw this press first; painting replaces the tap
  (e.currentTarget as Element).setPointerCapture(e.pointerId);
  stroke = { pointerId: e.pointerId, tool, group: ++strokes, last: cell, visited: new Set([`${cell.x},${cell.y}`]) };
  options.onPaint(tool, [cell], stroke.group);
}

function paintMove(e: PointerEvent, options: GridEditorOptions) {
  if (!stroke || stroke.pointerId !== e.pointerId || !options.onPaint) return;
  const to = pointerCell(e);
  if (!to || (to.x === stroke.last.x && to.y === stroke.last.y)) return;
  const { visited } = stroke;
  const cells = lineCells(stroke.last, to).filter((c) => {
    const key = `${c.x},${c.y}`;
    if (!onBoard(c, options) || visited.has(key)) return false;
    visited.add(key);
    return true;
  });
  stroke.last = to;
  if (cells.length > 0) options.onPaint(stroke.tool, cells, stroke.group);
}

function paintEnd(e: PointerEvent) {
  if (stroke?.pointerId === e.pointerId) stroke = null;
}

// Keyboard: one cell is in the tab order ("roving tabindex"); arrow keys move the focus,
// Enter or Space applies the selected tool.
const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

function keydown(e: KeyboardEvent, options: GridEditorOptions, x: number, y: number) {
  const cell = e.currentTarget as SVGElement;
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    tapped(e, options, x, y);
    return;
  }
  const arrow = ARROWS[e.key];
  if (!arrow) return;
  e.preventDefault();
  const next = cell.ownerSVGElement?.querySelector<SVGElement>(`[data-x="${x + arrow[0]}"][data-y="${y + arrow[1]}"]`);
  if (!next) return; // edge or ring corner
  cell.setAttribute("tabindex", "-1");
  next.setAttribute("tabindex", "0");
  next.focus();
}
