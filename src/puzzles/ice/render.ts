import { html, svg } from "lit-html";
import type { Dir } from "../../core/grid.ts";
import { detailOn, isDark, mix } from "../../core/puzzle-theme.ts";
import type { PieceIcon } from "../../core/icon-catalog.ts";
import type { PuzzleTheme } from "../../core/puzzle-theme.ts";
import type { PlayContext } from "../../core/types.ts";
import { t } from "../../i18n/t.ts";
import { CELL } from "../../ui/components/grid-editor.ts";
import { paletteCss, paletteStyle } from "../../ui/palette.ts";
import { PIECE_ICON_CSS, hasPieceIcon, pieceIcon } from "../../ui/piece-icons.ts";
import type { Palette } from "../../ui/palette.ts";
import { previewSvg } from "../../ui/preview.ts";
import { directionKey, directionPad, swipeCancel, swipeEnd, swipeStart } from "../../ui/components/swipe.ts";
import { dirTowards, initState, isSolved } from "./logic.ts";
import type { IceCell, IceData, IceMove, IceState } from "./logic.ts";

type Ctx = PlayContext<IceData, IceState, IceMove>;

const PAD = 12;

// Colors per role (M29): defaults for light and dark, and where a puzzle theme's colors go.
export const PALETTE: Palette = {
  scope: ".ice",
  vars: {
    "--ice-board": { light: "#dcecf8", dark: "#1e2c39", theme: "board" },
    "--ice-line": { light: "#c0d9ec", dark: "#2b3d4e", theme: "line" },
    "--ice-rock": { light: "#66717f", dark: "#77818e", theme: "wall" },
    "--ice-rock-top": { light: "#8d97a4", dark: "#9aa4b0", theme: (c) => mix(c.wall, "#ffffff", 0.2) },
    "--ice-sand": { light: "#e2c992", dark: "#7c6842", theme: "accent" },
    "--ice-grain": { light: "#b8975a", dark: "#b39a63", theme: (c) => mix(c.accent, isDark(c.accent) ? "#ffffff" : "#000000", 0.3) },
    "--ice-goal": { light: "#b56f00", dark: "#ffd23f", theme: "target" },
    "--ice-figure": { light: "#1d3557", dark: "#e9f1fb", theme: "figure" },
    "--ice-belly": { light: "#f4f8fc", dark: "#31506f", theme: (c) => detailOn(c.figure) },
    "--ice-glow": { light: "#ffb703", dark: "#ffd23f", theme: "done" },
  },
};

const STYLE = svg`<style>
  ${paletteCss(PALETTE)}
  .ice-board { fill: var(--ice-board); }
  .ice-line { stroke: var(--ice-line); stroke-width: 2; }
  .ice-rock { fill: var(--ice-rock); }
  .ice-rock-top { fill: var(--ice-rock-top); }
  .ice-sand { fill: var(--ice-sand); }
  .ice-grain { fill: var(--ice-grain); }
  .ice-goal { fill: none; stroke: var(--ice-goal); stroke-width: 8; }
  .ice-goal-dot { fill: var(--ice-goal); }
  .ice-goal.reached { stroke: var(--ice-glow); filter: drop-shadow(0 0 10px var(--ice-glow)); }
  .ice-figure { transition: transform 0.22s cubic-bezier(0.2, 0.7, 0.3, 1); }
  .ice-body { fill: var(--ice-figure); }
  .ice-belly { fill: var(--ice-belly); }
  ${PIECE_ICON_CSS}
  .ice-rock-icon { --icon-main: var(--ice-rock); --icon-detail: var(--ice-rock-top); }
  .ice-goal-icon { --icon-main: var(--ice-goal); --icon-detail: var(--ice-board); }
  .ice-goal-icon.reached { --icon-main: var(--ice-glow); filter: drop-shadow(0 0 10px var(--ice-glow)); }
  .ice-figure { --icon-main: var(--ice-figure); --icon-detail: var(--ice-belly); }
  .ice-problem { fill: none; stroke: var(--danger, #c6362f); stroke-width: 8; stroke-dasharray: 16 10; }
  @media (prefers-reduced-motion: reduce) {
    .ice-figure { transition: none; }
  }
</style>`;

export function renderPlay(ctx: Ctx) {
  const { data, state } = ctx;
  const move = (dir: Dir) => ctx.dispatch(dir);
  const pointerUp = (e: PointerEvent) => {
    const end = swipeEnd(e);
    if (end === null) return;
    if (end !== "tap") return move(end);
    // Tapping a cell in the figure's row or column slides it that way.
    const cell = pointerCell(e);
    const dir = cell ? dirTowards(state, cell) : null;
    if (dir) move(dir);
  };
  return html`
    <svg
      class="ice-play"
      viewBox="${-PAD} ${-PAD} ${data.width * CELL + 2 * PAD} ${data.height * CELL + 2 * PAD}"
      role="group"
      tabindex="0"
      aria-label=${t("iceBoard")}
      @pointerdown=${swipeStart}
      @pointerup=${pointerUp}
      @pointercancel=${swipeCancel}
      @keydown=${(e: KeyboardEvent) => {
        const dir = directionKey(e);
        if (dir) move(dir);
      }}
    >
      ${boardLayers(data, state, { theme: ctx.theme })}
    </svg>
    ${directionPad(move)}
    <p class="visually-hidden" aria-live="polite">${positionText(data, state)}</p>
  `;
}

/** The board cell under the pointer, or null outside the board. */
function pointerCell(e: PointerEvent): { x: number; y: number } | null {
  const matrix = (e.currentTarget as SVGSVGElement).getScreenCTM();
  if (!matrix) return null;
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
  return { x: Math.floor(p.x / CELL), y: Math.floor(p.y / CELL) };
}

function positionText(data: IceData, state: IceState): string {
  const where = t("icePosition", { column: state.x + 1, row: state.y + 1 });
  if (isSolved(data, state)) return `${where}. ${t("iceOnGoal")}`;
  const onSand = data.cells.some((c) => c.kind === "sand" && c.x === state.x && c.y === state.y);
  return onSand ? `${where}. ${t("iceOnSand")}` : where;
}

/**
 * Board, cells and figure in board units. `problemCells` (indexes into data.cells) are highlighted (editor).
 * In the editor `state` is the start position, so the figure marks the start.
 */
export function boardLayers(
  data: IceData,
  state: IceState,
  options: { problemCells?: ReadonlySet<number>; theme?: PuzzleTheme },
) {
  const { problemCells } = options;
  const of = (kind: IceCell["kind"]) => data.cells.filter((c) => c.kind === kind);
  const reached = isSolved(data, state);
  const icons = options.theme?.icons ?? {};
  // The group carries the color variables, so the layers work inside any <svg> (play view or grid editor).
  return svg`<g class="ice" style=${paletteStyle(PALETTE, options.theme)}>
    ${STYLE}
    <rect class="ice-board" x="0" y="0" width=${data.width * CELL} height=${data.height * CELL} rx="12"></rect>
    ${gridLines(data)}
    ${of("sand").map(sand)}
    ${of("wall").map((c) => rock(c, icons.rock))}
    ${of("goal").map((c) => goal(c, reached && c.x === state.x && c.y === state.y, icons.goal))}
    ${state.x >= 0 ? figure(state, icons.figure) : null}
    ${problemCells
      ? data.cells.map((c, i) =>
          problemCells.has(i)
            ? svg`<rect class="ice-problem" x=${c.x * CELL + 6} y=${c.y * CELL + 6} width=${CELL - 12} height=${CELL - 12} rx="10"></rect>`
            : null,
        )
      : null}
  </g>`;
}

function gridLines(data: IceData) {
  const lines = [];
  for (let x = 1; x < data.width; x++) {
    lines.push(svg`<line class="ice-line" x1=${x * CELL} y1="0" x2=${x * CELL} y2=${data.height * CELL}></line>`);
  }
  for (let y = 1; y < data.height; y++) {
    lines.push(svg`<line class="ice-line" x1="0" y1=${y * CELL} x2=${data.width * CELL} y2=${y * CELL}></line>`);
  }
  return lines;
}

function rock(c: IceCell, icon: PieceIcon | undefined) {
  const x = c.x * CELL;
  const y = c.y * CELL;
  if (hasPieceIcon(icon)) return pieceIcon(icon, x + 4, y + 4, CELL - 8, "ice-rock-icon");
  return svg`<rect class="ice-rock" x=${x + 6} y=${y + 10} width=${CELL - 12} height=${CELL - 16} rx="18"></rect>
    <rect class="ice-rock-top" x=${x + 16} y=${y + 16} width=${CELL - 40} height="18" rx="9"></rect>`;
}

// Sand: a flat cell with a few grains, so it differs from ice by more than color.
const GRAINS = [
  [24, 28],
  [62, 22],
  [44, 50],
  [78, 58],
  [26, 74],
  [60, 80],
] as const;

function sand(c: IceCell) {
  const x = c.x * CELL;
  const y = c.y * CELL;
  return svg`<rect class="ice-sand" x=${x + 3} y=${y + 3} width=${CELL - 6} height=${CELL - 6} rx="10"></rect>
    ${GRAINS.map(([gx, gy]) => svg`<circle class="ice-grain" cx=${x + gx} cy=${y + gy} r="5"></circle>`)}`;
}

function goal(c: IceCell, reached: boolean, icon: PieceIcon | undefined) {
  const cx = (c.x + 0.5) * CELL;
  const cy = (c.y + 0.5) * CELL;
  if (hasPieceIcon(icon)) return pieceIcon(icon, cx - 36, cy - 36, 72, `ice-goal-icon ${reached ? "reached" : ""}`);
  return svg`<circle class="ice-goal ${reached ? "reached" : ""}" cx=${cx} cy=${cy} r="34"></circle>
    <circle class="ice-goal-dot" cx=${cx} cy=${cy} r="10"></circle>`;
}

// The figure is one group moved with a CSS transform, so a slide animates.
function figure(p: IceState, icon: PieceIcon | undefined) {
  return svg`<g class="ice-figure" style="transform: translate(${p.x * CELL}px, ${p.y * CELL}px)">
    ${hasPieceIcon(icon)
      ? pieceIcon(icon, 4, 4, 92)
      : svg`<circle class="ice-body" cx="50" cy="50" r="30"></circle>
          <ellipse class="ice-belly" cx="50" cy="58" rx="16" ry="17"></ellipse>`}
  </g>`;
}

/** Card preview (M32): the starting position. */
export function renderPreview(data: IceData, theme: PuzzleTheme | undefined) {
  return previewSvg([-PAD, -PAD, data.width * CELL + 2 * PAD, data.height * CELL + 2 * PAD], boardLayers(data, initState(data), { theme }));
}
