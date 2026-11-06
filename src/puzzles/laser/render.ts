import { html, svg } from "lit-html";
import { pointKey } from "../../core/grid.ts";
import type { Dir } from "../../core/grid.ts";
import type { PlayContext } from "../../core/types.ts";
import { t } from "../../i18n/t.ts";
import type { MessageKey } from "../../i18n/t.ts";
import { CELL } from "../../ui/components/grid-editor.ts";
import { tapCancel, tapEnd, tapStart } from "../../ui/components/tap.ts";
import { cellAt, emitterColor, inventoryLeft, isTurnable, minVersion, targetCount, traceBeams } from "./logic.ts";
import type { Color, LaserCell, LaserData, LaserMove, LaserState, Orientation, PlacedCell } from "./logic.ts";

type Ctx = PlayContext<LaserData, LaserState, LaserMove>;

const PAD = 12;
const INVENTORY_ROW = 90; // board units above the board for the inventory

// Scoped to the SVG via class names; light and dark variants (dark per app theme).
const DARK = `--ls-board: #2a2c31; --ls-line: #3a3d44; --ls-wall: #8a8d94; --ls-red: #ff5a50; --ls-green: #4ade80;
  --ls-blue: #7aa7ff; --ls-target: #8f939b; --ls-lit: #ffd23f; --ls-mirror: #8fbaf0; --ls-fixed: #c7c9ce;
  --ls-base: #34465c; --ls-emitter: #e7e7ea; --ls-text: #c7c9ce;`;
const STYLE = svg`<style>
  .ls { --ls-board: #e4e1d8; --ls-line: #cfcbc0; --ls-wall: #6b6a66; --ls-red: #e3342f; --ls-green: #1f9d55;
        --ls-blue: #2563eb; --ls-target: #6e6b65; --ls-lit: #a66f00; --ls-mirror: #3c6e9e; --ls-fixed: #4b4a47;
        --ls-base: #c9d6e4; --ls-emitter: #2b2a28; --ls-text: #4b4a47; }
  /* Dark colors follow the app theme: data-theme on the html element, or the system setting without it. */
  :root[data-theme="dark"] .ls { ${DARK} }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme]) .ls { ${DARK} }
  }
  .ls .red { --ls-c: var(--ls-red); }
  .ls .green { --ls-c: var(--ls-green); }
  .ls .blue { --ls-c: var(--ls-blue); }
  .ls-board { fill: var(--ls-board); }
  .ls-line { stroke: var(--ls-line); stroke-width: 2; }
  .ls-wall { fill: var(--ls-wall); }
  .ls-target { fill: none; stroke: var(--ls-c, var(--ls-target)); stroke-width: 8; }
  .ls-target.lit { fill: var(--ls-c, var(--ls-lit)); stroke: var(--ls-c, var(--ls-lit)); filter: drop-shadow(0 0 10px var(--ls-c, var(--ls-lit))); }
  .ls-symbol { fill: var(--ls-c); }
  .lit > .ls-symbol, .ls-emitter-symbol { fill: var(--ls-board); }
  .ls-filter { fill: var(--ls-c); fill-opacity: 0.25; stroke: var(--ls-c); stroke-width: 6; }
  .ls-beam { fill: none; stroke: var(--ls-c); stroke-width: 10; stroke-linecap: round; stroke-linejoin: round; opacity: 0.35; }
  .ls-beam-flow { fill: none; stroke: var(--ls-c); stroke-width: 6; stroke-linecap: round; stroke-linejoin: round;
                  stroke-dasharray: 28 16; animation: ls-flow 0.8s linear infinite; }
  /* Green and blue beams also differ in their dash pattern (color vision deficiency). */
  .ls-beam-flow.green { stroke-dasharray: 10 12 10 12; }
  .ls-beam-flow.blue { stroke-dasharray: 30 8 6 8; }
  @keyframes ls-flow { to { stroke-dashoffset: -44; } }
  @media (prefers-reduced-motion: reduce) {
    .ls-beam-flow { animation: none; }
    .ls-beam-flow.red { stroke-dasharray: none; }
    .ls-mirror { transition: none; }
  }
  .ls-base { fill: var(--ls-base); }
  .ls-base.placed { fill: none; stroke: var(--ls-mirror); stroke-width: 4; stroke-dasharray: 10 8; }
  .ls-mirror { stroke: var(--ls-mirror); stroke-width: 12; stroke-linecap: round;
               transform-box: fill-box; transform-origin: center; transition: transform 0.15s ease-out; }
  .ls-mirror.fixed { stroke: var(--ls-fixed); stroke-width: 14; stroke-linecap: square; }
  /* A splitter is a half mirror: drawn dashed, so the beam visibly goes through. */
  .ls-mirror.split { stroke-dasharray: 12 9; stroke-linecap: butt; }
  .ls-emitter { fill: var(--ls-emitter); }
  .ls-emitter-tip { fill: var(--ls-c); }
  .ls-inventory-text { fill: var(--ls-text); font: 600 34px system-ui, sans-serif; }
  .ls-inventory .used { opacity: 0.3; }
  .ls-hit { fill: transparent; cursor: pointer; }
  .ls-hit:focus-visible { outline: none; stroke: var(--focus, #2f6fdd); stroke-width: 6; }
  .ls-problem { fill: none; stroke: var(--danger, #c6362f); stroke-width: 8; stroke-dasharray: 16 10; }
</style>`;

export function renderPlay(ctx: Ctx) {
  const { data, state } = ctx;
  const hit = traceBeams(data, state).hit.size;
  const inventory = data.inventory ?? 0;
  const top = -PAD - (inventory > 0 ? INVENTORY_ROW : 0);
  return html`
    <svg
      viewBox="${-PAD} ${top} ${data.width * CELL + 2 * PAD} ${data.height * CELL + PAD - top}"
      role="group"
      aria-label=${t(inventory > 0 ? "laserBoardInventory" : "laserBoard")}
    >
      ${boardLayers(data, state, { ctx })}
    </svg>
    <p class="visually-hidden" aria-live="polite">
      ${t("lsTargetsHit", { hit, total: targetCount(data) })}${inventory > 0
        ? `. ${t("lsInventoryLeft", { left: inventoryLeft(data, state), total: inventory })}`
        : ""}
    </p>
  `;
}

// Roving tabindex for boards with an inventory (every cell can be tapped): arrow keys move the focus.
let focused = 0;

/**
 * Board, cells and beams in board units. With `ctx` rotatable mirrors (and with an inventory every cell) can be
 * tapped, and the inventory is shown above the board; `problemCells` (indexes into data.cells) are highlighted (editor).
 */
export function boardLayers(
  data: LaserData,
  state: LaserState,
  options: { ctx?: Ctx; problemCells?: ReadonlySet<number> },
) {
  const { ctx, problemCells } = options;
  const trace = traceBeams(data, state);
  const colored = minVersion(data) >= 4; // symbols for colors only where colors matter
  const orientationOf = (c: PlacedCell): Orientation =>
    c.cell.kind === "mirror" || c.cell.kind === "splitter" ? (state.orientations[pointKey(c)] ?? c.cell.orientation) : "/";
  const of = <K extends LaserCell["kind"]>(kind: K) =>
    data.cells.filter((c): c is PlacedCell & { cell: Extract<LaserCell, { kind: K }> } => c.cell.kind === kind);
  const placed = Object.entries(state.placed).map(([key, orientation]) => {
    const [x, y] = key.split(",").map(Number) as [number, number];
    return { x, y, orientation };
  });

  // The group carries the color variables, so the layers work inside any <svg> (play view or grid editor).
  return svg`<g class="ls">
    ${STYLE}
    ${ctx && data.inventory ? inventoryRow(data, state) : null}
    <rect class="ls-board" x="0" y="0" width=${data.width * CELL} height=${data.height * CELL} rx="12"></rect>
    ${gridLines(data)}
    ${of("wall").map((c) => svg`<rect class="ls-wall" x=${c.x * CELL + 4} y=${c.y * CELL + 4} width=${CELL - 8} height=${CELL - 8} rx="8"></rect>`)}
    ${of("filter").map((c) => {
      const cx = (c.x + 0.5) * CELL;
      const cy = (c.y + 0.5) * CELL;
      return svg`<g class=${c.cell.color}>
        <rect class="ls-filter" x=${c.x * CELL + 14} y=${c.y * CELL + 14} width=${CELL - 28} height=${CELL - 28} rx="10"></rect>
        ${symbol(c.cell.color, cx, cy, 12, "ls-symbol")}
      </g>`;
    })}
    ${of("target").map((c) => {
      const lit = trace.hit.has(pointKey(c)) ? "lit" : "";
      const cx = (c.x + 0.5) * CELL;
      const cy = (c.y + 0.5) * CELL;
      return svg`<circle class="ls-target ${lit} ${c.cell.color ?? ""}" cx=${cx} cy=${cy} r="24"></circle>`;
    })}
    ${trace.beams.map((beam) => {
      const points = beam.points.map((p) => `${p.x * CELL},${p.y * CELL}`).join(" ");
      return svg`<g class=${beam.color}>
        <polyline class="ls-beam" points=${points}></polyline>
        <polyline class="ls-beam-flow ${beam.color}" points=${points}></polyline>
      </g>`;
    })}
    ${of("target").map((c) => {
      // Symbols above the beams, so they stay visible on lit targets.
      if (!c.cell.color) return null;
      const lit = trace.hit.has(pointKey(c)) ? "lit" : "";
      return svg`<g class="${c.cell.color} ${lit}">${symbol(c.cell.color, (c.x + 0.5) * CELL, (c.y + 0.5) * CELL, 10, "ls-symbol")}</g>`;
    })}
    ${data.cells.map((c) => (c.cell.kind === "mirror" || c.cell.kind === "splitter" ? mirror(c, orientationOf(c)) : null))}
    ${placed.map((p) => mirrorShape(p.x, p.y, p.orientation, "placed"))}
    ${of("emitter").map((c) => emitter(c.x, c.y, c.cell.dir, emitterColor(c.cell), colored))}
    ${problemCells
      ? data.cells.map((c, i) =>
          problemCells.has(i)
            ? svg`<rect class="ls-problem" x=${c.x * CELL + 6} y=${c.y * CELL + 6} width=${CELL - 12} height=${CELL - 12} rx="10"></rect>`
            : null,
        )
      : null}
    ${ctx ? hitAreas(data, state, ctx, orientationOf) : null}
  </g>`;
}

function inventoryRow(data: LaserData, state: LaserState) {
  const total = data.inventory ?? 0;
  const left = inventoryLeft(data, state);
  const y = -INVENTORY_ROW / 2 - PAD / 2;
  const size = 34;
  const right = data.width * CELL;
  return svg`<g class="ls-inventory" aria-hidden="true">
    <text class="ls-inventory-text" x="0" y=${y} dominant-baseline="central">${t("lsInventory")}</text>
    ${Array.from({ length: total }, (_, i) => {
      const cx = right - (total - i - 0.5) * (size * 2 + 8);
      return svg`<g class=${i < left ? "" : "used"}>
        <circle class="ls-base" cx=${cx} cy=${y} r=${size}></circle>
        <line class="ls-mirror" x1=${cx - size * 0.6} y1=${y + size * 0.6} x2=${cx + size * 0.6} y2=${y - size * 0.6}></line>
      </g>`;
    })}
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

function mirror(c: PlacedCell, orientation: Orientation) {
  if (c.cell.kind !== "mirror" && c.cell.kind !== "splitter") return null;
  const split = c.cell.kind === "splitter" ? "split" : "";
  return mirrorShape(c.x, c.y, orientation, c.cell.rotatable ? `rotatable ${split}` : `fixed ${split}`);
}

// Every mirror is drawn as "/" and turned by 90° for "\", so flipping animates.
function mirrorShape(x: number, y: number, orientation: Orientation, kind: string) {
  const cx = (x + 0.5) * CELL;
  const cy = (y + 0.5) * CELL;
  const r = CELL * 0.32;
  const fixed = kind.includes("fixed");
  return svg`
    ${fixed ? null : svg`<circle class="ls-base ${kind.includes("placed") ? "placed" : ""}" cx=${cx} cy=${cy} r=${CELL * 0.42}></circle>`}
    <line
      class="ls-mirror ${fixed ? "fixed" : ""} ${kind.includes("split") ? "split" : ""}"
      x1=${cx - r} y1=${cy + r} x2=${cx + r} y2=${cy - r}
      style="transform: rotate(${orientation === "/" ? 0 : 90}deg)"
    ></line>
  `;
}

const TURN: Record<Dir, number> = { E: 0, S: 90, W: 180, N: 270 };

function emitter(x: number, y: number, dir: Dir, color: Color, colored: boolean) {
  const cx = (x + 0.5) * CELL;
  const cy = (y + 0.5) * CELL;
  return svg`<g class=${color}>
    <g transform="translate(${cx} ${cy}) rotate(${TURN[dir]})">
      <rect class="ls-emitter" x="-32" y="-26" width="56" height="52" rx="10"></rect>
      <path class="ls-emitter-tip" d="M 8 -16 L 40 0 L 8 16 Z"></path>
    </g>
    ${colored ? symbol(color, cx - 4 * Math.cos((TURN[dir] * Math.PI) / 180), cy - 4 * Math.sin((TURN[dir] * Math.PI) / 180), 12, "ls-emitter-symbol") : null}
  </g>`;
}

/** A shape per color, so colors can be told apart without seeing them: red ▲, green ■, blue ◆. */
function symbol(color: Color, cx: number, cy: number, r: number, cls: string) {
  switch (color) {
    case "red":
      return svg`<path class=${cls} d="M ${cx} ${cy - r} L ${cx + r * 1.05} ${cy + r * 0.8} L ${cx - r * 1.05} ${cy + r * 0.8} Z"></path>`;
    case "green":
      return svg`<rect class=${cls} x=${cx - r * 0.8} y=${cy - r * 0.8} width=${r * 1.6} height=${r * 1.6}></rect>`;
    case "blue":
      return svg`<path class=${cls} d="M ${cx} ${cy - r} L ${cx + r} ${cy} L ${cx} ${cy + r} L ${cx - r} ${cy} Z"></path>`;
  }
}

function hitAreas(data: LaserData, state: LaserState, ctx: Ctx, orientationOf: (c: PlacedCell) => Orientation) {
  if (!data.inventory) {
    // Only rotatable pieces can be tapped; each is in the tab order.
    return data.cells
      .filter((c) => isTurnable(c.cell))
      .map((c) => {
        const orientation = t(orientationOf(c) === "/" ? "lsSlash" : "lsBackslash");
        const key: MessageKey = c.cell.kind === "splitter" ? "lsSplitterLabel" : "lsMirrorLabel";
        return hitArea(data, c.x, c.y, t(key, { column: c.x + 1, row: c.y + 1, orientation }), ctx, true, false);
      });
  }
  // With an inventory every cell can be tapped: roving tabindex over the whole board.
  if (focused >= data.width * data.height) focused = 0;
  const areas = [];
  for (let y = 0; y < data.height; y++) {
    for (let x = 0; x < data.width; x++) {
      const content = describeCell(data, x, y, state) || t("lsEmpty");
      const label = t("lsCellLabel", { column: x + 1, row: y + 1, content });
      areas.push(hitArea(data, x, y, label, ctx, focused === y * data.width + x, true));
    }
  }
  return areas;
}

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

function hitArea(data: LaserData, x: number, y: number, label: string, ctx: Ctx, inTabOrder: boolean, roving: boolean) {
  const tap = () => {
    if (roving) focused = y * data.width + x;
    ctx.dispatch({ x, y });
  };
  return svg`<rect
    class="ls-hit"
    data-x=${x}
    data-y=${y}
    x=${x * CELL} y=${y * CELL} width=${CELL} height=${CELL}
    tabindex=${inTabOrder ? 0 : -1}
    role="button"
    aria-label=${label}
    @keydown=${(e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        tap();
        return;
      }
      const arrow = roving ? ARROWS[e.key] : undefined;
      if (!arrow) return;
      e.preventDefault();
      const current = e.currentTarget as SVGElement;
      const next = current.ownerSVGElement?.querySelector<SVGElement>(`.ls-hit[data-x="${x + arrow[0]}"][data-y="${y + arrow[1]}"]`);
      if (!next) return;
      current.setAttribute("tabindex", "-1");
      next.setAttribute("tabindex", "0");
      next.focus();
      focused = (y + arrow[1]) * data.width + x + arrow[0];
    }}
    @pointerdown=${tapStart}
    @pointerup=${(e: PointerEvent) => tapEnd(e) && tap()}
    @pointercancel=${tapCancel}
  ></rect>`;
}

const DIR_NAME: Record<Dir, MessageKey> = { N: "dirN", E: "dirE", S: "dirS", W: "dirW" };
const COLOR_NAME: Record<Color, MessageKey> = { red: "lsRed", green: "lsGreen", blue: "lsBlue" };

/**
 * Content of a cell for screen readers; empty for an empty cell. With `state`, the current orientation of rotatable
 * pieces and the placed mirrors (play view); without, the start position (editor).
 */
export function describeCell(data: LaserData, x: number, y: number, state?: LaserState): string {
  const index = cellAt(data, x, y);
  const orientationText = (o: Orientation) => t(o === "/" ? "lsSlash" : "lsBackslash");
  if (index < 0) {
    const placed = state?.placed[pointKey({ x, y })];
    return placed ? `${t("lsPlaced")}, ${orientationText(placed)}` : "";
  }
  const { cell } = data.cells[index]!;
  const colored = minVersion(data) >= 4;
  switch (cell.kind) {
    case "wall":
      return t("lsToolWall");
    case "target":
      return colored && cell.color
        ? `${t("lsToolTarget")}, ${t("lsNeeds", { color: t(COLOR_NAME[cell.color]) })}`
        : t("lsToolTarget");
    case "emitter": {
      const text = `${t("lsToolEmitter")}, ${t(DIR_NAME[cell.dir])}`;
      return colored ? `${text}, ${t(COLOR_NAME[emitterColor(cell)])}` : text;
    }
    case "filter":
      return `${t("lsToolFilter")}, ${t(COLOR_NAME[cell.color])}`;
    case "mirror":
    case "splitter": {
      const orientation = (cell.rotatable && state?.orientations[pointKey({ x, y })]) || cell.orientation;
      const tool: MessageKey =
        cell.kind === "mirror"
          ? cell.rotatable ? "lsToolRotatable" : "lsToolMirror"
          : cell.rotatable ? "lsToolRotatableSplitter" : "lsToolSplitter";
      return `${t(tool)}, ${orientationText(orientation)}`;
    }
  }
}
