import { html, svg } from "lit-html";
import type { TemplateResult } from "lit-html";
import { t } from "../../i18n/t.ts";

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
      cells.push(svg`<rect
        class="ge-cell ${inRing ? "ring" : ""}"
        x=${x * CELL + (inRing ? 8 : 0)}
        y=${y * CELL + (inRing ? 8 : 0)}
        width=${CELL - (inRing ? 16 : 0)}
        height=${CELL - (inRing ? 16 : 0)}
        rx=${inRing ? 12 : 0}
        @pointerdown=${(e: PointerEvent) => press(e, x, y)}
        @pointerup=${(e: PointerEvent) => release(e, options, x, y)}
        @pointercancel=${() => (pressed = null)}
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
        role="img"
        aria-label=${options.label}
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

// A tap is pointerdown + pointerup on the same cell. Pointer events instead of click,
// because touch browsers may delay or swallow clicks (double-tap detection).
let pressed: { pointerId: number; x: number; y: number } | null = null;

function press(e: PointerEvent, x: number, y: number) {
  if (!e.isPrimary || e.button !== 0) return;
  // Touch pointers are implicitly captured by the start cell; release so pointerup hits the cell under the finger.
  (e.currentTarget as Element).releasePointerCapture(e.pointerId);
  pressed = { pointerId: e.pointerId, x, y };
}

function release(e: PointerEvent, options: GridEditorOptions, x: number, y: number) {
  const tapped = pressed?.pointerId === e.pointerId && pressed.x === x && pressed.y === y;
  pressed = null;
  if (!tapped) return;
  const form = (e.currentTarget as Element).closest("form");
  if (!form) return;
  const tool = new FormData(form).get("tool");
  if (typeof tool === "string") options.onTap(tool, x, y);
}
