import { html, svg } from "lit-html";
import { pointKey } from "../../core/grid.ts";
import type { Dir } from "../../core/grid.ts";
import type { PlayContext } from "../../core/types.ts";
import { t } from "../../i18n/t.ts";
import { CELL } from "../../ui/components/grid-editor.ts";
import { tapCancel, tapEnd, tapStart } from "../../ui/components/tap.ts";
import { targetCount, traceBeams } from "./logic.ts";
import type { LaserData, LaserMove, LaserState, Orientation, PlacedCell } from "./logic.ts";

type Ctx = PlayContext<LaserData, LaserState, LaserMove>;

const PAD = 12;

// Scoped to the SVG via class names; light and dark variants.
const STYLE = svg`<style>
  .ls { --ls-board: #e4e1d8; --ls-line: #cfcbc0; --ls-wall: #6b6a66; --ls-beam: #e3342f; --ls-target: #6e6b65;
        --ls-lit: #a66f00; --ls-mirror: #3c6e9e; --ls-fixed: #4b4a47; --ls-base: #c9d6e4; --ls-emitter: #2b2a28; }
  @media (prefers-color-scheme: dark) {
    .ls { --ls-board: #2a2c31; --ls-line: #3a3d44; --ls-wall: #8a8d94; --ls-beam: #ff5a50; --ls-target: #8f939b;
          --ls-lit: #ffd23f; --ls-mirror: #8fbaf0; --ls-fixed: #c7c9ce; --ls-base: #34465c; --ls-emitter: #e7e7ea; }
  }
  .ls-board { fill: var(--ls-board); }
  .ls-line { stroke: var(--ls-line); stroke-width: 2; }
  .ls-wall { fill: var(--ls-wall); }
  .ls-target { fill: none; stroke: var(--ls-target); stroke-width: 8; }
  .ls-target.lit { fill: var(--ls-lit); stroke: var(--ls-lit); filter: drop-shadow(0 0 10px var(--ls-lit)); }
  .ls-beam { fill: none; stroke: var(--ls-beam); stroke-width: 10; stroke-linecap: round; stroke-linejoin: round; opacity: 0.35; }
  .ls-beam-flow { fill: none; stroke: var(--ls-beam); stroke-width: 6; stroke-linecap: round; stroke-linejoin: round;
                  stroke-dasharray: 28 16; animation: ls-flow 0.8s linear infinite; }
  @keyframes ls-flow { to { stroke-dashoffset: -44; } }
  @media (prefers-reduced-motion: reduce) {
    .ls-beam-flow { animation: none; stroke-dasharray: none; }
    .ls-mirror { transition: none; }
  }
  .ls-base { fill: var(--ls-base); }
  .ls-mirror { stroke: var(--ls-mirror); stroke-width: 12; stroke-linecap: round;
               transform-box: fill-box; transform-origin: center; transition: transform 0.15s ease-out; }
  .ls-mirror.fixed { stroke: var(--ls-fixed); stroke-width: 14; stroke-linecap: square; }
  .ls-emitter { fill: var(--ls-emitter); }
  .ls-emitter-tip { fill: var(--ls-beam); }
  .ls-hit { fill: transparent; cursor: pointer; }
  .ls-problem { fill: none; stroke: var(--danger, #c6362f); stroke-width: 8; stroke-dasharray: 16 10; }
</style>`;

export function renderPlay(ctx: Ctx) {
  const { data } = ctx;
  const hit = traceBeams(data, ctx.state).hit.size;
  return html`
    <svg
      viewBox="${-PAD} ${-PAD} ${data.width * CELL + 2 * PAD} ${data.height * CELL + 2 * PAD}"
      role="group"
      aria-label=${t("laserBoard")}
    >
      ${boardLayers(data, ctx.state, { ctx })}
    </svg>
    <p class="visually-hidden" aria-live="polite">${t("lsTargetsHit", { hit, total: targetCount(data) })}</p>
  `;
}

/**
 * Board, cells and beams in board units. With `ctx` rotatable mirrors can be tapped;
 * `problemCells` (indexes into data.cells) are highlighted (editor).
 */
export function boardLayers(
  data: LaserData,
  state: LaserState,
  options: { ctx?: Ctx; problemCells?: ReadonlySet<number> },
) {
  const { ctx, problemCells } = options;
  const trace = traceBeams(data, state);
  const orientationOf = (c: PlacedCell): Orientation =>
    c.cell.kind === "mirror" ? (state.orientations[pointKey(c)] ?? c.cell.orientation) : "/";
  const of = (kind: PlacedCell["cell"]["kind"]) => data.cells.filter((c) => c.cell.kind === kind);

  // The group carries the color variables, so the layers work inside any <svg> (play view or grid editor).
  return svg`<g class="ls">
    ${STYLE}
    <rect class="ls-board" x="0" y="0" width=${data.width * CELL} height=${data.height * CELL} rx="12"></rect>
    ${gridLines(data)}
    ${of("wall").map((c) => svg`<rect class="ls-wall" x=${c.x * CELL + 4} y=${c.y * CELL + 4} width=${CELL - 8} height=${CELL - 8} rx="8"></rect>`)}
    ${of("target").map((c) => {
      const lit = trace.hit.has(pointKey(c)) ? "lit" : "";
      return svg`<circle class="ls-target ${lit}" cx=${(c.x + 0.5) * CELL} cy=${(c.y + 0.5) * CELL} r="24"></circle>`;
    })}
    ${trace.beams.map((beam) => {
      const points = beam.points.map((p) => `${p.x * CELL},${p.y * CELL}`).join(" ");
      return svg`<polyline class="ls-beam" points=${points}></polyline><polyline class="ls-beam-flow" points=${points}></polyline>`;
    })}
    ${of("mirror").map((c) => mirror(c, orientationOf(c)))}
    ${of("emitter").map((c) => (c.cell.kind === "emitter" ? emitter(c.x, c.y, c.cell.dir) : null))}
    ${problemCells
      ? data.cells.map((c, i) =>
          problemCells.has(i)
            ? svg`<rect class="ls-problem" x=${c.x * CELL + 6} y=${c.y * CELL + 6} width=${CELL - 12} height=${CELL - 12} rx="10"></rect>`
            : null,
        )
      : null}
    ${ctx ? of("mirror").filter((c) => c.cell.kind === "mirror" && c.cell.rotatable).map((c) => hitArea(c, orientationOf(c), ctx)) : null}
  </g>`;
}

function gridLines(data: LaserData) {
  const lines = [];
  for (let x = 1; x < data.width; x++) {
    lines.push(svg`<line class="ls-line" x1=${x * CELL} y1="0" x2=${x * CELL} y2=${data.height * CELL}></line>`);
  }
  for (let y = 1; y < data.height; y++) {
    lines.push(svg`<line class="ls-line" x1="0" y1=${y * CELL} x2=${data.width * CELL} y2=${y * CELL}></line>`);
  }
  return lines;
}

// Every mirror is drawn as "/" and turned by 90° for "\", so flipping animates.
function mirror(c: PlacedCell, orientation: Orientation) {
  const rotatable = c.cell.kind === "mirror" && c.cell.rotatable;
  const cx = (c.x + 0.5) * CELL;
  const cy = (c.y + 0.5) * CELL;
  const r = CELL * 0.32;
  return svg`
    ${rotatable ? svg`<circle class="ls-base" cx=${cx} cy=${cy} r=${CELL * 0.42}></circle>` : null}
    <line
      class="ls-mirror ${rotatable ? "" : "fixed"}"
      x1=${cx - r} y1=${cy + r} x2=${cx + r} y2=${cy - r}
      style="transform: rotate(${orientation === "/" ? 0 : 90}deg)"
    ></line>
  `;
}

const TURN: Record<Dir, number> = { E: 0, S: 90, W: 180, N: 270 };

function emitter(x: number, y: number, dir: Dir) {
  const cx = (x + 0.5) * CELL;
  const cy = (y + 0.5) * CELL;
  return svg`<g transform="translate(${cx} ${cy}) rotate(${TURN[dir]})">
    <rect class="ls-emitter" x="-32" y="-26" width="56" height="52" rx="10"></rect>
    <path class="ls-emitter-tip" d="M 8 -16 L 40 0 L 8 16 Z"></path>
  </g>`;
}

function hitArea(c: PlacedCell, orientation: Orientation, ctx: Ctx) {
  const flip = () => ctx.dispatch({ x: c.x, y: c.y });
  return svg`<rect
    class="ls-hit"
    x=${c.x * CELL} y=${c.y * CELL} width=${CELL} height=${CELL}
    tabindex="0"
    role="button"
    aria-label=${t("lsMirrorLabel", { column: c.x + 1, row: c.y + 1, orientation: t(orientation === "/" ? "lsSlash" : "lsBackslash") })}
    @keydown=${(e: KeyboardEvent) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      flip();
    }}
    @pointerdown=${tapStart}
    @pointerup=${(e: PointerEvent) => tapEnd(e) && flip()}
    @pointercancel=${tapCancel}
  ></rect>`;
}
