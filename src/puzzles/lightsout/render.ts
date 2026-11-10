import { html, svg } from "lit-html";
import { isDark, mix } from "../../core/puzzle-theme.ts";
import type { PieceIcon } from "../../core/icon-catalog.ts";
import type { PuzzleTheme } from "../../core/puzzle-theme.ts";
import type { PlayContext } from "../../core/types.ts";
import { t, tn } from "../../i18n/t.ts";
import { CELL } from "../../ui/components/grid-editor.ts";
import { paletteCss, paletteStyle } from "../../ui/palette.ts";
import { PIECE_ICON_CSS, hasPieceIcon, pieceIcon } from "../../ui/piece-icons.ts";
import type { Palette } from "../../ui/palette.ts";
import { previewSvg } from "../../ui/preview.ts";
import { tapCancel, tapEnd, tapStart } from "../../ui/components/tap.ts";
import { height, initState, isCell, lightsOn, width } from "./logic.ts";
import type { LightsOutData, LightsOutMove, LightsOutState } from "./logic.ts";

type Ctx = PlayContext<LightsOutData, LightsOutState, LightsOutMove>;

const PAD = 12;
const INSET = 6;

// Scoped to the SVG via class names; light and dark variants (dark per app theme).
// Colors per role (M29): defaults for light and dark, and where a puzzle theme's colors go.
// Without a theme the tiles lie directly on the page, as before. Off cells are dark in both app themes, so a lit cell
// stands out by brightness, glow and its bulb.
export const PALETTE: Palette = {
  scope: ".lo",
  vars: {
    "--lo-board": { light: "transparent", dark: "transparent", theme: "board" },
    "--lo-off": { light: "#555d6b", dark: "#343943", theme: "piece" },
    "--lo-off-edge": { light: "#3f4652", dark: "#4a505c", theme: (c) => mix(c.piece, c.board, 0.3) },
    "--lo-on": { light: "#ffc933", dark: "#ffd23f", theme: "done" },
    "--lo-on-edge": { light: "#b07d00", dark: "#ffe58a", theme: (c) => mix(c.done, isDark(c.done) ? "#ffffff" : "#000000", 0.3) },
    "--lo-bulb": { light: "#fff6d6", dark: "#fffbe8", theme: (c) => mix(c.done, "#ffffff", 0.8) },
    "--lo-hole": { light: "#b8b2a5", dark: "#4a505c", theme: "line" },
  },
};

const STYLE = svg`<style>
  ${paletteCss(PALETTE)}
  .lo-board { fill: var(--lo-board); }
  .lo-tile { fill: var(--lo-off); stroke: var(--lo-off-edge); stroke-width: 4;
             transition: fill 0.18s ease-out, stroke 0.18s ease-out, filter 0.18s ease-out; }
  .lo-cell.on .lo-tile { fill: var(--lo-on); stroke: var(--lo-on-edge); filter: drop-shadow(0 0 10px var(--lo-on)); }
  .lo-bulb { fill: var(--lo-bulb); opacity: 0; transition: opacity 0.18s ease-out; }
  .lo-cell.on .lo-bulb { opacity: 0.85; }
  .lo-cell.play { cursor: pointer; }
  ${PIECE_ICON_CSS}
  /* A lamp icon takes the bulb's place: dim when off, bright and glowing when on. */
  .lo-cell .piece-icon { --icon-main: var(--lo-off-edge); --icon-detail: var(--lo-off); transition: filter 0.18s ease-out; }
  .lo-cell.on .piece-icon { --icon-main: var(--lo-bulb); --icon-detail: var(--lo-on-edge); filter: drop-shadow(0 0 6px var(--lo-bulb)); }
  .lo-hole { fill: none; stroke: var(--lo-hole); stroke-width: 3; stroke-dasharray: 10 8; }
  @media (prefers-reduced-motion: reduce) {
    .lo-tile, .lo-bulb { transition: none; }
  }
</style>`;

export function renderPlay(ctx: Ctx) {
  const { data, state } = ctx;
  return html`
    <svg
      viewBox="${-PAD} ${-PAD} ${width(data) * CELL + 2 * PAD} ${height(data) * CELL + 2 * PAD}"
      role="group"
      aria-label=${t("lightsOutBoard")}
    >
      ${boardLayers(data, state, { ctx, theme: ctx.theme })}
    </svg>
    <p class="visually-hidden" aria-live="polite">${tn("loLightsOn", lightsOn(state))}</p>
  `;
}

// Roving tabindex: only one cell is in the tab order; arrow keys move the focus, Enter or Space taps.
let focused = -1;

/** Cells and lights in board units. With `ctx` cells can be tapped; with `showHoles` holes are outlined (editor). */
export function boardLayers(
  data: LightsOutData,
  state: LightsOutState,
  options: { ctx?: Ctx; showHoles?: boolean; theme?: PuzzleTheme },
) {
  const { ctx, showHoles } = options;
  const w = width(data);
  if (ctx && !isCell(data, focused % w, Math.floor(focused / w))) focused = firstCell(data);
  const cells = [];
  for (let y = 0; y < height(data); y++) {
    for (let x = 0; x < w; x++) {
      const index = y * w + x;
      if (!isCell(data, x, y)) {
        if (showHoles) {
          cells.push(svg`<rect class="lo-hole" x=${x * CELL + INSET} y=${y * CELL + INSET} width=${CELL - 2 * INSET} height=${CELL - 2 * INSET} rx="14"></rect>`);
        }
        continue;
      }
      cells.push(cell(data, x, y, !!state.on[index], ctx, index === focused, options.theme?.icons?.lamp));
    }
  }
  // The group carries the color variables, so the layers work inside any <svg> (play view or grid editor).
  return svg`<g class="lo" style=${paletteStyle(PALETTE, options.theme)}>
    ${STYLE}
    <rect class="lo-board" x="0" y="0" width=${w * CELL} height=${height(data) * CELL} rx="12"></rect>
    ${cells}
  </g>`;
}

function cell(data: LightsOutData, x: number, y: number, on: boolean, ctx: Ctx | undefined, inTabOrder: boolean, icon?: PieceIcon) {
  const tile = svg`<rect class="lo-tile" x=${x * CELL + INSET} y=${y * CELL + INSET} width=${CELL - 2 * INSET} height=${CELL - 2 * INSET} rx="14"></rect>
    ${hasPieceIcon(icon)
      ? pieceIcon(icon, x * CELL + 18, y * CELL + 18, CELL - 36)
      : svg`<circle class="lo-bulb" cx=${(x + 0.5) * CELL} cy=${(y + 0.5) * CELL} r="14"></circle>`}`;
  if (!ctx) return svg`<g class="lo-cell ${on ? "on" : ""}">${tile}</g>`;
  const tap = () => {
    focused = y * width(data) + x;
    ctx.dispatch({ x, y });
  };
  return svg`<g
    class="lo-cell play ${on ? "on" : ""}"
    data-x=${x}
    data-y=${y}
    role="button"
    tabindex=${inTabOrder ? 0 : -1}
    aria-label=${t(on ? "loCellOn" : "loCellOff", { column: x + 1, row: y + 1 })}
    @keydown=${(e: KeyboardEvent) => keydown(e, data, x, y, tap)}
    @pointerdown=${tapStart}
    @pointerup=${(e: PointerEvent) => tapEnd(e) && tap()}
    @pointercancel=${tapCancel}
  >${tile}</g>`;
}

function firstCell(data: LightsOutData): number {
  const w = width(data);
  for (let i = 0; i < w * height(data); i++) if (isCell(data, i % w, Math.floor(i / w))) return i;
  return -1;
}

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

function keydown(e: KeyboardEvent, data: LightsOutData, x: number, y: number, tap: () => void) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    tap();
    return;
  }
  const arrow = ARROWS[e.key];
  if (!arrow) return;
  e.preventDefault();
  // Skip holes: the next cell in this direction.
  let nx = x + arrow[0];
  let ny = y + arrow[1];
  while (nx >= 0 && ny >= 0 && nx < width(data) && ny < height(data) && !isCell(data, nx, ny)) {
    nx += arrow[0];
    ny += arrow[1];
  }
  const current = e.currentTarget as SVGElement;
  const next = current.ownerSVGElement?.querySelector<SVGElement>(`.lo-cell[data-x="${nx}"][data-y="${ny}"]`);
  if (!next) return;
  current.setAttribute("tabindex", "-1");
  next.setAttribute("tabindex", "0");
  next.focus();
  focused = ny * width(data) + nx;
}

/** Card preview (M32): the starting position. */
export function renderPreview(data: LightsOutData, theme: PuzzleTheme | undefined) {
  return previewSvg([-PAD, -PAD, width(data) * CELL + 2 * PAD, height(data) * CELL + 2 * PAD], boardLayers(data, initState(data), { theme }));
}
