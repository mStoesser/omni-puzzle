import { html, svg } from "lit-html";
import type { TemplateResult } from "lit-html";
import { t } from "../../i18n/t.ts";
import { tapCancel, tapEnd, tapStart } from "./tap.ts";

/** Board units per cell. Plugins draw their board content in this coordinate system. */
export const CELL = 100;

export type PaletteItem = { id: string; label: string; icon: string };

export type GridEditorOptions = {
  width: number;
  height: number;
  /** Adds a tappable ring of cells around the board (x/y = -1 and width/height), e.g. for exits. */
  ring: boolean;
  size: { min: number; max: number; onResize(width: number, height: number): void };
  palette: readonly PaletteItem[];
  /** SVG content in board units, drawn below the tap layer. */
  board: unknown;
  label: string;
  onTap(tool: string, x: number, y: number): void;
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
        role="group"
        aria-label="${options.label}. ${t("geKeyboardHint")}"
      >
        ${options.board} ${cells}
      </svg>
      <div class="size-controls">
        ${stepper(t("width"), w, options.size, (v) => options.size.onResize(v, h))}
        ${stepper(t("height"), h, options.size, (v) => options.size.onResize(w, v))}
      </div>
    </form>
  `;
}

function stepper(label: string, value: number, size: GridEditorOptions["size"], set: (value: number) => void) {
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

function tapped(e: Event, options: GridEditorOptions, x: number, y: number) {
  const form = (e.currentTarget as Element).closest("form");
  if (!form) return;
  const tool = new FormData(form).get("tool");
  if (typeof tool === "string") options.onTap(tool, x, y);
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
