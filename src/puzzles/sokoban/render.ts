import { html, svg } from "lit-html";
import type { Dir } from "../../core/grid.ts";
import type { PlayContext } from "../../core/types.ts";
import { t } from "../../i18n/t.ts";
import { CELL } from "../../ui/components/grid-editor.ts";
import { directionKey, directionPad, swipeCancel, swipeEnd, swipeStart } from "../../ui/components/swipe.ts";
import { boxesOnGoals, cellPoint, charAt, height, insideCells, neighbour, prepare, walkPath, width } from "./logic.ts";
import type { Board, SokobanData, SokobanMove, SokobanState } from "./logic.ts";

type Ctx = PlayContext<SokobanData, SokobanState, SokobanMove>;

const PAD = 12;
/** Pause between the steps of a walk to a tapped cell. */
const STEP_MS = 90;

// Scoped to the SVG via class names; light and dark variants (dark per app theme).
const STYLE = svg`<style>
  .sk { --sk-void: transparent; --sk-floor: #e9e4d8; --sk-line: #dcd5c5; --sk-wall: #8a7f6e; --sk-wall-top: #a89d8b;
        --sk-goal: #c2410c; --sk-box: #b7792f; --sk-box-edge: #7c4f19; --sk-box-done: #2f8f5b; --sk-box-done-edge: #1d5e3a;
        --sk-figure: #1d3557; --sk-face: #f4f8fc; }
  /* Dark colors follow the app theme: data-theme on the html element, or the system setting without it. */
  :root[data-theme="dark"] .sk { --sk-floor: #2a2c31; --sk-line: #34373e; --sk-wall: #5d5649; --sk-wall-top: #776e5e;
        --sk-goal: #ff8a66; --sk-box: #c98a3e; --sk-box-edge: #8a5a22; --sk-box-done: #3fbf7f; --sk-box-done-edge: #23784f;
        --sk-figure: #e9f1fb; --sk-face: #31506f; }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme]) .sk { --sk-floor: #2a2c31; --sk-line: #34373e; --sk-wall: #5d5649; --sk-wall-top: #776e5e;
        --sk-goal: #ff8a66; --sk-box: #c98a3e; --sk-box-edge: #8a5a22; --sk-box-done: #3fbf7f; --sk-box-done-edge: #23784f;
        --sk-figure: #e9f1fb; --sk-face: #31506f; }
  }
  .sk-floor { fill: var(--sk-floor); stroke: var(--sk-line); stroke-width: 2; }
  .sk-outside { fill: var(--sk-floor); opacity: 0.35; }
  .sk-wall { fill: var(--sk-wall); }
  .sk-wall-top { fill: var(--sk-wall-top); }
  .sk-goal { fill: none; stroke: var(--sk-goal); stroke-width: 7; }
  .sk-box, .sk-figure { transition: transform 0.1s linear; }
  .sk-crate { fill: var(--sk-box); stroke: var(--sk-box-edge); stroke-width: 6; }
  .sk-slat { stroke: var(--sk-box-edge); stroke-width: 6; stroke-linecap: round; }
  .sk-box.done .sk-crate { fill: var(--sk-box-done); stroke: var(--sk-box-done-edge); }
  .sk-box.done .sk-slat { stroke: var(--sk-box-done-edge); }
  .sk-body { fill: var(--sk-figure); }
  .sk-face { fill: var(--sk-face); }
  .sk-problem { fill: none; stroke: var(--danger, #c6362f); stroke-width: 8; stroke-dasharray: 16 10; }
  @media (prefers-reduced-motion: reduce) {
    .sk-box, .sk-figure { transition: none; }
  }
</style>`;

// --- Walking to a tapped cell ---
// The steps are dispatched one by one, so each is a move (move count, undo per step) and the figure
// visibly walks. The walk stops on any other input, and as soon as the figure is not where the next
// step expects it (undo, restart, another puzzle).

let current: Ctx | null = null;
let walk: { timer: ReturnType<typeof setTimeout> } | null = null;

function stopWalk() {
  if (walk) clearTimeout(walk.timer);
  walk = null;
}

function startWalk(board: Element, steps: { dir: Dir; from: number }[]) {
  stopWalk();
  const tick = () => {
    const step = steps.shift();
    const ctx = current;
    if (!step || !ctx || !board.isConnected || ctx.state.player !== step.from) return stopWalk();
    ctx.dispatch(step.dir);
    walk = steps.length > 0 ? { timer: setTimeout(tick, STEP_MS) } : null;
  };
  tick();
}

export function renderPlay(ctx: Ctx) {
  current = ctx;
  const { data, state } = ctx;
  const move = (dir: Dir) => {
    stopWalk();
    ctx.dispatch(dir);
  };
  const pointerUp = (e: PointerEvent) => {
    const end = swipeEnd(e);
    if (end === null) return;
    if (end !== "tap") return move(end);
    const cell = pointerCell(e);
    if (cell) tapCell(e.currentTarget as Element, ctx, cell, move);
  };
  return html`
    <svg
      class="sk-play"
      viewBox="${-PAD} ${-PAD} ${width(data) * CELL + 2 * PAD} ${height(data) * CELL + 2 * PAD}"
      role="group"
      tabindex="0"
      aria-label=${t("sokobanBoard")}
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
    <p class="visually-hidden" aria-live="polite">${statusText(data, state)}</p>
  `;
}

/** A tap next to the figure on a box pushes it; a tap on a reachable cell walks there. */
function tapCell(board: Element, ctx: Ctx, cell: { x: number; y: number }, move: (dir: Dir) => void) {
  const prepared = prepare(ctx.data);
  const index = cell.y * prepared.width + cell.x;
  const { state } = ctx;
  for (const dir of ["N", "E", "S", "W"] as const) {
    if (neighbour(prepared, state.player, dir) === index && state.boxes.includes(index)) return move(dir);
  }
  const path = walkPath(ctx.data, state, cell);
  if (!path || path.length === 0) return;
  let from = state.player;
  const steps = path.map((dir) => {
    const step = { dir, from };
    from = neighbour(prepared, from, dir);
    return step;
  });
  startWalk(board, steps);
}

/** The board cell under the pointer, or null outside the board. */
function pointerCell(e: PointerEvent): { x: number; y: number } | null {
  const matrix = (e.currentTarget as SVGSVGElement).getScreenCTM();
  if (!matrix) return null;
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
  return { x: Math.floor(p.x / CELL), y: Math.floor(p.y / CELL) };
}

function statusText(data: SokobanData, state: SokobanState): string {
  const board = prepare(data);
  const { x, y } = cellPoint(board, state.player);
  return `${t("sokobanPosition", { column: x + 1, row: y + 1 })}. ${t("sokobanBoxes", { done: boxesOnGoals(board, state), total: state.boxes.length })}`;
}

// The inside of the warehouse only depends on the data; it is cached per data object.
const insideCache = new WeakMap<SokobanData, Set<number>>();

function inside(data: SokobanData): Set<number> {
  let cells = insideCache.get(data);
  if (!cells) insideCache.set(data, (cells = insideCells(data)));
  return cells;
}

/**
 * Board, boxes and figure in board units. `problemCells` (cell indexes) are highlighted (editor).
 * Floor outside the walls (not reachable by the figure) is drawn faint.
 */
export function boardLayers(data: SokobanData, state: SokobanState, options: { problemCells?: ReadonlySet<number> }) {
  const board = prepare(data);
  const within = inside(data);
  const tiles = [];
  const walls = [];
  const goals = [];
  for (let y = 0; y < board.height; y++) {
    for (let x = 0; x < board.width; x++) {
      const ch = charAt(data, x, y);
      const index = y * board.width + x;
      if (ch === "#") {
        walls.push(wall(x, y));
        continue;
      }
      tiles.push(svg`<rect class=${within.has(index) ? "sk-floor" : "sk-outside"} x=${x * CELL} y=${y * CELL} width=${CELL} height=${CELL}></rect>`);
      if (board.goals[index]) goals.push(svg`<circle class="sk-goal" cx=${(x + 0.5) * CELL} cy=${(y + 0.5) * CELL} r="22"></circle>`);
    }
  }
  // The group carries the color variables, so the layers work inside any <svg> (play view or grid editor).
  return svg`<g class="sk">
    ${STYLE}
    ${tiles} ${goals} ${walls}
    ${state.boxes.map((cell) => box(board, cell))}
    ${state.player >= 0 ? figure(board, state.player) : null}
    ${options.problemCells
      ? [...options.problemCells].map((cell) => {
          const { x, y } = cellPoint(board, cell);
          return svg`<rect class="sk-problem" x=${x * CELL + 6} y=${y * CELL + 6} width=${CELL - 12} height=${CELL - 12} rx="10"></rect>`;
        })
      : null}
  </g>`;
}

function wall(x: number, y: number) {
  return svg`<rect class="sk-wall" x=${x * CELL + 2} y=${y * CELL + 2} width=${CELL - 4} height=${CELL - 4} rx="8"></rect>
    <rect class="sk-wall-top" x=${x * CELL + 12} y=${y * CELL + 12} width=${CELL - 24} height="14" rx="7"></rect>`;
}

// Boxes and the figure are groups moved with a CSS transform, so steps and pushes animate.
function box(board: Board, cell: number) {
  const { x, y } = cellPoint(board, cell);
  return svg`<g class="sk-box ${board.goals[cell] ? "done" : ""}" style="transform: translate(${x * CELL}px, ${y * CELL}px)">
    <rect class="sk-crate" x="12" y="12" width="76" height="76" rx="10"></rect>
    <path class="sk-slat" d="M 26 26 L 74 74 M 74 26 L 26 74"></path>
  </g>`;
}

function figure(board: Board, cell: number) {
  const { x, y } = cellPoint(board, cell);
  return svg`<g class="sk-figure" style="transform: translate(${x * CELL}px, ${y * CELL}px)">
    <circle class="sk-body" cx="50" cy="50" r="30"></circle>
    <circle class="sk-face" cx="50" cy="44" r="13"></circle>
  </g>`;
}
