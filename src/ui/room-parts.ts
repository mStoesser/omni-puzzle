import { svg } from "lit-html";
import type { SVGTemplateResult } from "lit-html";
import { DEFAULT_COLORS, PERSPECTIVE, colorOf, itemBox } from "../rooms/compose.ts";
import type { CeilingPart, ColorId, Composition, FloorPart, ItemPart, PlacedItem, SidePart, Surface, WallPart } from "../rooms/compose.ts";

// The parts of the room builder (M49), drawn like the built-in pictures (room-images.ts): flat shapes in picture units
// (1600 × 900). Placeholders, to be replaced by better drawings later; the ids and the perspective stay.

const { vanish: V, back: B, width: W, height: H } = PERSPECTIVE;
const FAR = 1 / PERSPECTIVE.scale; // depth of the back wall; the picture plane is at depth 1

type Draw = (c: string) => SVGTemplateResult;

/** A color mixed towards black (amount < 0) or white (amount > 0). */
export function shade(hex: string, amount: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const channel = (v: number) => Math.round(amount < 0 ? v * (1 + amount) : v + (255 - v) * amount);
  return `rgb(${channel((n >> 16) & 255)} ${channel((n >> 8) & 255)} ${channel(n & 255)})`;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const points = (list: readonly (readonly [number, number])[]) => list.map(([x, y]) => `${r1(x)},${r1(y)}`).join(" ");

/** A point on the floor: `x` where it meets the picture's bottom edge, `z` its depth (1 = front, FAR = back wall). */
const onFloor = (x: number, z: number) => [V.x + (x - V.x) / z, V.y + (H - V.y) / z] as const;
const onCeiling = (x: number, z: number) => [V.x + (x - V.x) / z, V.y - V.y / z] as const;
/** A point on the left side wall: `y` where it meets the picture's left edge. */
const onLeft = (y: number, z: number) => [V.x - V.x / z, V.y + (y - V.y) / z] as const;
/** A quad on a surface between two lines (`a`, `b`) and two depths. */
const quad = (at: (u: number, z: number) => readonly [number, number], a: number, b: number, z1: number, z2: number) =>
  points([at(a, z1), at(b, z1), at(b, z2), at(a, z2)]);

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

// --- Back walls: the whole width between ceiling and floor ---

const WALL_TOP = B.top;
const WALL_H = B.bottom - B.top;

const walls: Record<WallPart, Draw> = {
  plaster: (c) => svg`
    <rect y=${WALL_TOP} width=${W} height=${WALL_H} fill=${c} />
    <rect y=${WALL_TOP} width=${W} height="14" fill=${shade(c, 0.12)} />
    <rect y=${B.bottom - 22} width=${W} height="22" fill=${shade(c, -0.3)} />`,
  panels: (c) => svg`
    <rect y=${WALL_TOP} width=${W} height=${WALL_H} fill=${shade(c, 0.15)} />
    <rect y="440" width=${W} height=${B.bottom - 440} fill=${c} />
    <rect y="432" width=${W} height="12" fill=${shade(c, -0.3)} />
    ${range(10).map((i) => svg`<rect x=${i * 160 + 18} y="470" width="124" height="200" rx="4" fill=${shade(c, -0.12)} />`)}
    <rect y=${B.bottom - 20} width=${W} height="20" fill=${shade(c, -0.4)} />`,
  bricks: (c) => svg`
    <rect y=${WALL_TOP} width=${W} height=${WALL_H} fill=${shade(c, -0.4)} />
    ${range(15).map((row) =>
      range(15).map(
        (col) => svg`<rect x=${col * 120 - (row % 2) * 60 + 3} y=${WALL_TOP + row * 42 + 3} width="114" height="36" rx="3"
          fill=${(row * 7 + col * 3) % 4 === 0 ? shade(c, 0.1) : (row + col) % 3 === 0 ? shade(c, -0.08) : c} />`,
      ),
    )}`,
  tiles: (c) => svg`
    <rect y=${WALL_TOP} width=${W} height=${WALL_H} fill=${shade(c, -0.12)} />
    ${range(11).map((row) => range(20).map((col) => svg`<rect x=${col * 80 + 2} y=${WALL_TOP + row * 60 + 2} width="76" height="56" fill=${c} />`))}
    <rect y=${B.bottom - 18} width=${W} height="18" fill=${shade(c, -0.35)} />`,
};

// --- Floors: in perspective, from the back wall to the bottom edge ---

const floorBase = (c: string) => svg`<rect y=${B.bottom} width=${W} height=${H - B.bottom} fill=${c} />`;
const FLOOR_ROWS = [1, 1.09, 1.19, 1.3, FAR] as const;

const floors: Record<FloorPart, Draw> = {
  boards: (c) => svg`
    ${floorBase(c)}
    ${range(17).map((i) => {
      const x = -800 + i * 200;
      return svg`<polygon points=${quad(onFloor, x, x + 100, 1, FAR)} fill=${shade(c, -0.08)} />
        <polygon points=${points([onFloor(x, 1), onFloor(x, FAR), onFloor(x + 4, FAR), onFloor(x + 6, 1)])} fill=${shade(c, -0.35)} />`;
    })}
    <rect y=${B.bottom} width=${W} height="6" fill=${shade(c, -0.4)} />`,
  checker: (c) => svg`
    ${floorBase(shade(c, -0.75))}
    ${range(4).map((row) =>
      range(16).map((col) =>
        (row + col) % 2 ? svg`<polygon points=${quad(onFloor, -800 + col * 200, -600 + col * 200, FLOOR_ROWS[row]!, FLOOR_ROWS[row + 1]!)} fill=${c} />` : null,
      ),
    )}`,
  flagstones: (c) => svg`
    ${floorBase(shade(c, -0.45))}
    ${range(4).map((row) =>
      range(13).map((col) => {
        const x = -900 + col * 260 + (row % 2) * 130;
        const z1 = FLOOR_ROWS[row]! + 0.008;
        const z2 = FLOOR_ROWS[row + 1]! - 0.008;
        return svg`<polygon points=${quad(onFloor, x + 8, x + 252, z1, z2)} fill=${(row + col) % 3 ? c : shade(c, 0.1)} />`;
      }),
    )}`,
};

// --- Ceilings: in perspective, from the top edge to the back wall ---

const ceilings: Record<CeilingPart, Draw> = {
  plain: (c) => svg`
    <rect width=${W} height=${B.top} fill=${c} />
    <rect y=${B.top - 8} width=${W} height="8" fill=${shade(c, -0.25)} />`,
  beams: (c) => svg`
    <rect width=${W} height=${B.top} fill=${shade(c, 0.55)} />
    ${range(9).map((i) => {
      const x = -1000 + i * 450;
      return svg`<polygon points=${quad(onCeiling, x, x + 90, 1, FAR)} fill=${c} />`;
    })}
    <rect y=${B.top - 10} width=${W} height="10" fill=${c} />`,
};

// --- Side walls: drawn on the left; the right one is mirrored ---

const sideWall = (c: string) => svg`
  <polygon points=${points([[0, 0], [B.left, B.top], [B.left, B.bottom], [0, H]])} fill=${shade(c, -0.18)} />
  <polygon points=${quad(onLeft, H - 34, H, 1, FAR)} fill=${shade(c, -0.45)} />
  <polygon points=${quad(onLeft, 0, 20, 1, FAR)} fill=${shade(c, -0.05)} />
  <polygon points=${points([[B.left - 4, B.top], [B.left, B.top], [B.left, B.bottom], [B.left - 4, B.bottom + 3]])} fill=${shade(c, -0.4)} />`;

const sides: Record<SidePart, Draw> = {
  plain: sideWall,
  window: (c) => svg`
    ${sideWall(c)}
    <polygon points=${quad(onLeft, 230, 600, 1.06, 1.32)} fill=${shade(c, -0.5)} />
    <polygon points=${quad(onLeft, 250, 580, 1.08, 1.3)} fill="#a7c4d9" />
    <polygon points=${quad(onLeft, 250, 330, 1.08, 1.3)} fill="#d7e8f2" opacity="0.7" />
    <polygon points=${quad(onLeft, 408, 422, 1.08, 1.3)} fill=${shade(c, -0.5)} />
    <polygon points=${quad(onLeft, 250, 580, 1.183, 1.197)} fill=${shade(c, -0.5)} />
    <polygon points=${quad(onLeft, 600, 618, 1.04, 1.34)} fill=${shade(c, 0.25)} />`,
};

// --- Items: drawn around (0, 0) = the middle of their bottom edge (see ITEM_BOX) ---

const GOLD = "#d9b25a";

const items: Record<ItemPart, Draw> = {
  desk: (c) => svg`
    <rect x="-250" y="-250" width="500" height="30" rx="4" fill=${shade(c, 0.1)} />
    <rect x="-230" y="-220" width="200" height="220" fill=${c} />
    <rect x="-215" y="-205" width="170" height="60" rx="4" fill=${shade(c, 0.08)} /><circle cy="-175" r="6" cx="-130" fill=${GOLD} />
    <rect x="-215" y="-130" width="170" height="60" rx="4" fill=${shade(c, 0.08)} /><circle cy="-100" r="6" cx="-130" fill=${GOLD} />
    <rect x="-30" y="-220" width="250" height="40" fill=${shade(c, -0.15)} />
    <rect x="196" y="-220" width="24" height="220" fill=${shade(c, -0.3)} />
    <rect x="-230" y="-10" width="200" height="10" fill=${shade(c, -0.35)} />`,
  showcase: (c) => svg`
    <rect x="-120" y="-430" width="240" height="430" rx="6" fill=${c} />
    <rect x="-102" y="-410" width="204" height="340" fill="#cfe6ef" opacity="0.45" />
    <rect x="-102" y="-300" width="204" height="8" fill=${shade(c, -0.2)} />
    <rect x="-102" y="-190" width="204" height="8" fill=${shade(c, -0.2)} />
    <path d="M-20 -300 h40 l-8 -40 h-24 z" fill=${GOLD} /><rect x="-6" y="-360" width="12" height="20" fill=${GOLD} />
    <line x1="0" y1="-410" x2="0" y2="-70" stroke=${shade(c, -0.25)} stroke-width="4" />
    <polygon points="-90,-400 -60,-400 -100,-330 -100,-370" fill="#ffffff" opacity="0.35" />
    <rect x="-120" y="-60" width="240" height="60" fill=${shade(c, -0.2)} />
    <circle cx="14" cy="-240" r="5" fill=${GOLD} />`,
  bookshelf: (c) => svg`
    <rect x="-150" y="-500" width="300" height="500" fill=${c} />
    <rect x="-132" y="-482" width="264" height="464" fill=${shade(c, -0.35)} />
    ${range(4).map((i) => svg`<rect x="-132" y=${-382 + i * 116} width="264" height="16" fill=${c} />`)}
    ${range(4).map((shelf) =>
      range(9).map((b) => {
        if ((b + shelf * 2) % 7 === 6) return null;
        const h = 70 + ((b * 13 + shelf * 7) % 4) * 8;
        const color = ["#c0392b", "#2e86c1", "#27ae60", "#d68910", "#8e44ad", "#e8dcb8"][(b + shelf) % 6]!;
        return svg`<rect x=${-126 + b * 28} y=${-382 + shelf * 116 - h} width="24" height=${h} rx="2" fill=${color} opacity="0.85" />`;
      }),
    )}`,
  safe: (c) => svg`
    <rect x="-100" y="-180" width="200" height="170" rx="8" fill=${c} />
    <rect x="-84" y="-164" width="168" height="138" rx="6" fill=${shade(c, -0.15)} />
    <circle cx="-10" cy="-95" r="32" fill=${shade(c, -0.45)} /><circle cx="-10" cy="-95" r="7" fill=${shade(c, 0.6)} />
    ${range(8).map((i) => svg`<rect x="-12" y="-125" width="4" height="8" fill=${shade(c, 0.5)} transform="rotate(${i * 45} -10 -95)" />`)}
    <rect x="44" y="-108" width="20" height="26" rx="4" fill=${shade(c, 0.6)} />
    <rect x="-90" y="-10" width="30" height="10" fill=${shade(c, -0.5)} /><rect x="60" y="-10" width="30" height="10" fill=${shade(c, -0.5)} />`,
  door: (c) => svg`
    <rect x="-110" y="-480" width="220" height="480" fill="#2b2420" />
    <rect x="-98" y="-468" width="196" height="468" fill=${c} />
    <rect x="-78" y="-444" width="156" height="200" rx="4" fill=${shade(c, -0.12)} />
    <rect x="-78" y="-214" width="156" height="190" rx="4" fill=${shade(c, -0.12)} />
    <circle cx="70" cy="-232" r="10" fill=${GOLD} />`,
  chest: (c) => svg`
    <path d="M-115 -100 q0 -40 115 -40 q115 0 115 40 z" fill=${shade(c, 0.1)} />
    <rect x="-115" y="-100" width="230" height="100" fill=${c} />
    <rect x="-115" y="-104" width="230" height="10" fill=${shade(c, -0.4)} />
    <rect x="-80" y="-138" width="16" height="138" fill=${shade(c, -0.4)} /><rect x="64" y="-138" width="16" height="138" fill=${shade(c, -0.4)} />
    <rect x="-14" y="-96" width="28" height="34" rx="4" fill=${GOLD} /><circle cy="-82" r="4" fill="#3d2a18" />`,
  painting: (c) => svg`
    <rect x="-130" y="-200" width="260" height="200" fill=${c} />
    <rect x="-112" y="-182" width="224" height="164" fill="#a7c4d9" />
    <circle cx="50" cy="-140" r="20" fill="#f5d76e" />
    <path d="M-112 -18 v-50 q60 -50 120 -10 q50 -40 104 0 v60 z" fill="#5f8f5a" />
    <path d="M-112 -18 v-24 q80 -30 224 -6 v30 z" fill="#4a7347" />`,
  lamp: (c) => svg`
    <rect x="-3" y="-200" width="6" height="120" fill="#222" />
    <ellipse cy="-12" rx="70" ry="22" fill="#f7e9a0" opacity="0.35" />
    <path d="M-60 -20 l24 -64 h72 l24 64 z" fill=${c} />
    <ellipse cy="-20" rx="60" ry="10" fill=${shade(c, -0.3)} />
    <circle cy="-12" r="12" fill="#fff6c8" />`,
  plant: (c) => svg`
    <ellipse cx="-30" cy="-170" rx="26" ry="70" fill="#3f8a4f" transform="rotate(-25 -30 -170)" />
    <ellipse cx="30" cy="-170" rx="26" ry="70" fill="#4a9a5a" transform="rotate(25 30 -170)" />
    <ellipse cx="0" cy="-190" rx="24" ry="70" fill="#35764a" />
    <ellipse cx="-44" cy="-120" rx="20" ry="50" fill="#4a9a5a" transform="rotate(-50 -44 -120)" />
    <ellipse cx="44" cy="-120" rx="20" ry="50" fill="#3f8a4f" transform="rotate(50 44 -120)" />
    <path d="M-55 -95 h110 l-14 95 h-82 z" fill=${c} />
    <rect x="-60" y="-100" width="120" height="16" rx="3" fill=${shade(c, -0.2)} />`,
  clock: (c) => svg`
    <rect x="-50" y="-420" width="100" height="120" rx="12" fill=${c} />
    <circle cy="-360" r="38" fill="#efe7d3" />
    <line x1="0" y1="-360" x2="0" y2="-388" stroke="#222" stroke-width="5" /><line x1="0" y1="-360" x2="20" y2="-352" stroke="#222" stroke-width="5" />
    <rect x="-40" y="-300" width="80" height="250" fill=${shade(c, -0.12)} />
    <rect x="-24" y="-280" width="48" height="190" rx="4" fill=${shade(c, -0.45)} />
    <line x1="0" y1="-280" x2="0" y2="-140" stroke=${GOLD} stroke-width="3" /><circle cy="-136" r="14" fill=${GOLD} />
    <rect x="-56" y="-50" width="112" height="50" fill=${c} />`,
  window: (c) => svg`
    <rect x="-130" y="-260" width="260" height="240" fill=${c} />
    <rect x="-114" y="-244" width="228" height="208" fill="#a7c4d9" />
    <polygon points="-114,-244 -40,-244 -114,-150" fill="#d7e8f2" opacity="0.7" />
    <rect x="-6" y="-244" width="12" height="208" fill=${c} /><rect x="-114" y="-146" width="228" height="12" fill=${c} />
    <rect x="-146" y="-24" width="292" height="24" rx="4" fill=${shade(c, -0.15)} />`,
  barrel: (c) => svg`
    <ellipse cy="-14" rx="80" ry="14" fill=${shade(c, -0.35)} />
    <path d="M-80 -200 q-14 93 0 186 h160 q14 -93 0 -186 z" fill=${c} />
    <ellipse cy="-200" rx="80" ry="20" fill=${shade(c, 0.12)} />
    <ellipse cy="-200" rx="66" ry="14" fill=${shade(c, -0.15)} />
    <rect x="-86" y="-160" width="172" height="12" fill="#3d3a36" /><rect x="-86" y="-60" width="172" height="12" fill="#3d3a36" />`,
  rug: (c) => svg`
    <polygon points="-260,-90 260,-90 320,0 -320,0" fill=${c} />
    <polygon points="-232,-78 232,-78 280,-12 -280,-12" fill="none" stroke=${shade(c, 0.35)} stroke-width="6" />
    <polygon points="-120,-62 120,-62 140,-28 -140,-28" fill=${shade(c, -0.2)} />`,
};

// --- Putting it together ---

const known = <T extends string>(table: Record<T, Draw>, part: string): part is T => Object.hasOwn(table, part);

/** A surface; parts this version does not know are drawn with the first part of their slot (see rooms/compose.ts). */
function surfaceOf<T extends string>(table: Record<T, Draw>, fallback: T, defaults: Record<T, ColorId>, s: Surface): SVGTemplateResult {
  const part = known(table, s.part) ? s.part : fallback;
  return table[part](colorOf(s.color, defaults[part]));
}

/** One item at its place; unknown items are left out. */
export function placedItem(item: PlacedItem): SVGTemplateResult | null {
  const box = itemBox(item.part);
  if (!box || !known(items, item.part)) return null;
  const x = r1((item.x / 100) * W);
  const flip = item.flip ? " scale(-1 1)" : "";
  return svg`<g transform="translate(${x} ${box.base})${flip}">${items[item.part](colorOf(item.color, DEFAULT_COLORS.item[item.part]))}</g>`;
}

/** The drawing of a composition, to put into an `<svg viewBox=ROOM_VIEWBOX>`. */
export function composedPicture(c: Composition): SVGTemplateResult {
  const side = (s: Surface | undefined, mirror: boolean) =>
    s ? svg`<g transform=${mirror ? `translate(${W} 0) scale(-1 1)` : ""}>${surfaceOf(sides, "plain", DEFAULT_COLORS.side, s)}</g>` : null;
  return svg`
    ${surfaceOf(walls, "plaster", DEFAULT_COLORS.wall, c.wall)}
    ${surfaceOf(ceilings, "plain", DEFAULT_COLORS.ceiling, c.ceiling)}
    ${surfaceOf(floors, "boards", DEFAULT_COLORS.floor, c.floor)}
    ${side(c.left, false)}${side(c.right, true)}
    ${c.items.map(placedItem)}
  `;
}

/** An item on its own, for the editor's choice of items: the drawing and a viewBox around it. */
export function itemPreview(part: ItemPart, color?: string): { viewBox: string; drawing: SVGTemplateResult } {
  const box = itemBox(part)!;
  const pad = 12;
  return {
    viewBox: `${-box.w / 2 - pad} ${-box.h - pad} ${box.w + 2 * pad} ${box.h + 2 * pad}`,
    drawing: items[part](colorOf(color ?? DEFAULT_COLORS.item[part], DEFAULT_COLORS.item[part])),
  };
}
