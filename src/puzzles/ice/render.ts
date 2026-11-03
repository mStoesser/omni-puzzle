import { html, svg } from "lit-html";
import type { Dir } from "../../core/grid.ts";
import type { PlayContext } from "../../core/types.ts";
import { t } from "../../i18n/t.ts";
import { CELL } from "../../ui/components/grid-editor.ts";
import { directionKey, directionPad, swipeCancel, swipeEnd, swipeStart } from "../../ui/components/swipe.ts";
import { dirTowards, isSolved } from "./logic.ts";
import type { IceCell, IceData, IceMove, IceState } from "./logic.ts";

type Ctx = PlayContext<IceData, IceState, IceMove>;

const PAD = 12;

// Scoped to the SVG via class names; light and dark variants (dark per app theme).
const STYLE = svg`<style>
  .ice { --ice-board: #dcecf8; --ice-line: #c0d9ec; --ice-rock: #66717f; --ice-rock-top: #8d97a4; --ice-sand: #e2c992;
         --ice-grain: #b8975a; --ice-goal: #b56f00; --ice-figure: #1d3557; --ice-belly: #f4f8fc; --ice-glow: #ffb703; }
  /* Dark colors follow the app theme: data-theme on the html element, or the system setting without it. */
  :root[data-theme="dark"] .ice { --ice-board: #1e2c39; --ice-line: #2b3d4e; --ice-rock: #77818e; --ice-rock-top: #9aa4b0;
         --ice-sand: #7c6842; --ice-grain: #b39a63; --ice-goal: #ffd23f; --ice-figure: #e9f1fb; --ice-belly: #31506f; --ice-glow: #ffd23f; }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme]) .ice { --ice-board: #1e2c39; --ice-line: #2b3d4e; --ice-rock: #77818e; --ice-rock-top: #9aa4b0;
         --ice-sand: #7c6842; --ice-grain: #b39a63; --ice-goal: #ffd23f; --ice-figure: #e9f1fb; --ice-belly: #31506f; --ice-glow: #ffd23f; }
  }
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
      ${boardLayers(data, state, {})}
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
export function boardLayers(data: IceData, state: IceState, options: { problemCells?: ReadonlySet<number> }) {
  const { problemCells } = options;
  const of = (kind: IceCell["kind"]) => data.cells.filter((c) => c.kind === kind);
  const reached = isSolved(data, state);
  // The group carries the color variables, so the layers work inside any <svg> (play view or grid editor).
  return svg`<g class="ice">
    ${STYLE}
    <rect class="ice-board" x="0" y="0" width=${data.width * CELL} height=${data.height * CELL} rx="12"></rect>
    ${gridLines(data)}
    ${of("sand").map(sand)}
    ${of("wall").map(rock)}
    ${of("goal").map((c) => goal(c, reached && c.x === state.x && c.y === state.y))}
    ${state.x >= 0 ? figure(state) : null}
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

function rock(c: IceCell) {
  const x = c.x * CELL;
  const y = c.y * CELL;
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

function goal(c: IceCell, reached: boolean) {
  const cx = (c.x + 0.5) * CELL;
  const cy = (c.y + 0.5) * CELL;
  return svg`<circle class="ice-goal ${reached ? "reached" : ""}" cx=${cx} cy=${cy} r="34"></circle>
    <circle class="ice-goal-dot" cx=${cx} cy=${cy} r="10"></circle>`;
}

// The figure is one group moved with a CSS transform, so a slide animates.
function figure(p: IceState) {
  return svg`<g class="ice-figure" style="transform: translate(${p.x * CELL}px, ${p.y * CELL}px)">
    <circle class="ice-body" cx="50" cy="50" r="30"></circle>
    <ellipse class="ice-belly" cx="50" cy="58" rx="16" ry="17"></ellipse>
  </g>`;
}
