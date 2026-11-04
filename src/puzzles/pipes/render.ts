import { html, svg } from "lit-html";
import type { PlayContext } from "../../core/types.ts";
import { t } from "../../i18n/t.ts";
import type { MessageKey } from "../../i18n/t.ts";
import { CELL } from "../../ui/components/grid-editor.ts";
import { tapCancel, tapEnd, tapStart } from "../../ui/components/tap.ts";
import { BIT, canTurn, connected, currentMasks, height, initState, isFixed, maskAt, width } from "./logic.ts";
import type { PipesData, PipesMove, PipesState } from "./logic.ts";

type Ctx = PlayContext<PipesData, PipesState, PipesMove>;

const PAD = 16; // room for pipe caps that point off the board
const HALF = CELL / 2;
/** Delay per tile when water flows into newly connected pipes. */
const FLOW_MS = 45;

// Scoped to the SVG via class names; light and dark variants (dark per app theme).
const STYLE = svg`<style>
  .pp { --pp-board: #e4e1d8; --pp-tile: #f3f0e8; --pp-fixed: #d3cec1; --pp-bolt: #8f897c; --pp-pipe: #8b8f97;
        --pp-water: #1f7ae0; --pp-source: #0d4f9e; --pp-ring: #ffffff; }
  /* Dark colors follow the app theme: data-theme on the html element, or the system setting without it. */
  :root[data-theme="dark"] .pp { --pp-board: #22252b; --pp-tile: #2c3038; --pp-fixed: #3b404a; --pp-bolt: #7d838e;
        --pp-pipe: #6b717c; --pp-water: #4ea3ff; --pp-source: #a9d1ff; --pp-ring: #22252b; }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme]) .pp { --pp-board: #22252b; --pp-tile: #2c3038; --pp-fixed: #3b404a; --pp-bolt: #7d838e;
        --pp-pipe: #6b717c; --pp-water: #4ea3ff; --pp-source: #a9d1ff; --pp-ring: #22252b; }
  }
  .pp-board { fill: var(--pp-board); }
  .pp-tile { fill: var(--pp-tile); }
  .pp-cell.fixed .pp-tile { fill: var(--pp-fixed); }
  .pp-bolt { fill: var(--pp-bolt); }
  .pp-turn { transition: transform 0.15s ease-out; }
  .pp-pipe { stroke: var(--pp-pipe); stroke-width: 22; stroke-linecap: round; fill: none; transition: stroke 0.2s ease-out; }
  .pp-hub { fill: var(--pp-pipe); transition: fill 0.2s ease-out; }
  .pp-cell.full .pp-pipe { stroke: var(--pp-water); }
  .pp-cell.full .pp-hub { fill: var(--pp-water); }
  .pp-source { fill: var(--pp-source); stroke: var(--pp-ring); stroke-width: 6; }
  .pp-cell.play.turnable { cursor: pointer; }
  @media (prefers-reduced-motion: reduce) {
    .pp-turn, .pp-pipe, .pp-hub { transition: none !important; }
  }
</style>`;

export function renderPlay(ctx: Ctx) {
  const { data, state } = ctx;
  const masks = currentMasks(data, state);
  const pipes = masks.filter(Boolean).length;
  const full = [...connected(data, masks).keys()].filter((cell) => masks[cell]).length;
  return html`
    <svg
      viewBox="${-PAD} ${-PAD} ${width(data) * CELL + 2 * PAD} ${height(data) * CELL + 2 * PAD}"
      role="group"
      aria-label=${t("pipesBoard")}
    >
      ${boardLayers(data, state, { ctx })}
    </svg>
    <p class="visually-hidden" aria-live="polite">${t("ppConnected", { done: full, total: pipes })}</p>
  `;
}

// Roving tabindex: only one tile is in the tab order; arrow keys move the focus, Enter or Space turns.
let focused = -1;

/** Board and tiles in board units. With `ctx` tiles can be turned by tapping or keyboard. */
export function boardLayers(data: PipesData, state: PipesState = initState(data), options: { ctx?: Ctx } = {}) {
  const { ctx } = options;
  const w = width(data);
  const masks = currentMasks(data, state);
  const flow = connected(data, masks);
  if (ctx && !maskAt(data, focused % w, Math.floor(focused / w))) focused = masks.findIndex(Boolean);
  const tiles = [];
  for (let y = 0; y < height(data); y++) {
    for (let x = 0; x < w; x++) {
      const index = y * w + x;
      if (!maskAt(data, x, y)) continue;
      tiles.push(tile(data, x, y, state.turns[index]!, flow.get(index), ctx, index === focused));
    }
  }
  // The group carries the color variables, so the layers work inside any <svg> (play view or grid editor).
  return svg`<g class="pp">
    ${STYLE}
    <rect class="pp-board" x="0" y="0" width=${w * CELL} height=${height(data) * CELL} rx="12"></rect>
    ${tiles}
  </g>`;
}

function tile(data: PipesData, x: number, y: number, turns: number, distance: number | undefined, ctx: Ctx | undefined, inTabOrder: boolean) {
  const base = maskAt(data, x, y);
  const fixed = isFixed(data, x, y);
  const turnable = canTurn(base) && !fixed;
  const isSource = data.source.x === x && data.source.y === y;
  const full = distance !== undefined;
  const cx = x * CELL + HALF;
  const cy = y * CELL + HALF;
  const ends = (["N", "E", "S", "W"] as const).filter((dir) => base & BIT[dir]);
  const reach = { N: [0, -HALF], E: [HALF, 0], S: [0, HALF], W: [-HALF, 0] } as const;
  const classes = `pp-cell ${ctx ? "play" : ""} ${turnable ? "turnable" : ""} ${fixed ? "fixed" : ""} ${full ? "full" : ""}`;
  // Water flows outwards from the source: each tile fills a little later than the one before; draining is instant.
  const delay = `transition-delay: ${full ? distance * FLOW_MS : 0}ms`;
  const content = svg`
    <rect class="pp-tile" x=${x * CELL + 3} y=${y * CELL + 3} width=${CELL - 6} height=${CELL - 6} rx="12"></rect>
    ${fixed ? bolts(x, y) : null}
    <g class="pp-turn" style="transform-origin: ${cx}px ${cy}px; transform: rotate(${turns * 90}deg)">
      ${ends.map((dir) => svg`<line class="pp-pipe" style=${delay} x1=${cx} y1=${cy} x2=${cx + reach[dir][0]} y2=${cy + reach[dir][1]}></line>`)}
      <circle class="pp-hub" style=${delay} cx=${cx} cy=${cy} r=${ends.length === 1 ? 20 : 11}></circle>
    </g>
    ${isSource ? svg`<circle class="pp-source" cx=${cx} cy=${cy} r="22"></circle>` : null}
  `;
  if (!ctx) return svg`<g class=${classes}>${content}</g>`;
  const turn = () => {
    focused = y * width(data) + x;
    if (turnable) ctx.dispatch({ x, y });
  };
  return svg`<g
    class=${classes}
    data-x=${x}
    data-y=${y}
    role="button"
    tabindex=${inTabOrder ? 0 : -1}
    aria-label=${label(base, x, y, { isSource, fixed, full })}
    @keydown=${(e: KeyboardEvent) => keydown(e, data, x, y, turn)}
    @pointerdown=${tapStart}
    @pointerup=${(e: PointerEvent) => tapEnd(e) && turn()}
    @pointercancel=${tapCancel}
  >${content}</g>`;
}

function bolts(x: number, y: number) {
  return [
    [16, 16],
    [CELL - 16, 16],
    [16, CELL - 16],
    [CELL - 16, CELL - 16],
  ].map(([bx, by]) => svg`<circle class="pp-bolt" cx=${x * CELL + bx!} cy=${y * CELL + by!} r="5"></circle>`);
}

/** Name of a tile's shape for screen readers. */
export function shapeName(mask: number): MessageKey {
  const ends = [1, 2, 4, 8].filter((bit) => mask & bit).length;
  if (ends === 1) return "ppShapeEnd";
  if (ends === 3) return "ppShapeTee";
  if (ends === 4) return "ppShapeCross";
  return mask === 5 || mask === 10 ? "ppShapeStraight" : "ppShapeCurve";
}

function label(mask: number, x: number, y: number, flags: { isSource: boolean; fixed: boolean; full: boolean }) {
  const parts = [
    t(flags.isSource ? "ppSource" : shapeName(mask)),
    t("ppPosition", { column: x + 1, row: y + 1 }),
    t(flags.full ? "ppFull" : "ppEmpty"),
  ];
  if (flags.fixed) parts.push(t("ppFixed"));
  return parts.join(", ");
}

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

function keydown(e: KeyboardEvent, data: PipesData, x: number, y: number, turn: () => void) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    turn();
    return;
  }
  const arrow = ARROWS[e.key];
  if (!arrow) return;
  e.preventDefault();
  // Skip empty cells: the next tile in this direction.
  let nx = x + arrow[0];
  let ny = y + arrow[1];
  while (nx >= 0 && ny >= 0 && nx < width(data) && ny < height(data) && !maskAt(data, nx, ny)) {
    nx += arrow[0];
    ny += arrow[1];
  }
  const current = e.currentTarget as SVGElement;
  const next = current.ownerSVGElement?.querySelector<SVGElement>(`.pp-cell[data-x="${nx}"][data-y="${ny}"]`);
  if (!next) return;
  current.setAttribute("tabindex", "-1");
  next.setAttribute("tabindex", "0");
  next.focus();
  focused = ny * width(data) + nx;
}
