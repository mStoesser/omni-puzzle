// Escape rooms (M49): a scene picture built from parts ("Raumbaukasten"). Only ids are stored, like icons: a back wall,
// a floor and a ceiling, optional side walls laid over them, and items that stand against the back wall and only move
// sideways. Pure and DOM-free; the drawings are in ui/room-parts.ts.
//
// Ids are kept forever: once a room is shared, an id may get a better drawing but never another meaning. Loading is
// tolerant of ids this version does not know (a newer app may have added parts): they are kept and drawn with a
// fallback (surfaces) or left out (items). Publishing accepts only known ones (`unknownParts`).

// --- The fixed perspective ("Guckkasten") ---

/**
 * One-point perspective in picture units (1600 × 900, ROOM_VIEWBOX): everything runs towards the vanishing point, the
 * back wall is the picture scaled by 0.7 around it. In percent (like tap areas) the back wall spans x 15–85 and y 9–79;
 * the floor line is at 79 %. Without side walls the back wall fills the whole width between ceiling and floor.
 */
export const PERSPECTIVE = {
  width: 1600,
  height: 900,
  vanish: { x: 800, y: 270 },
  scale: 0.7,
  back: { left: 240, right: 1360, top: 81, bottom: 711 },
} as const;

// --- Parts ---

export const WALLS = ["plaster", "panels", "bricks", "tiles"] as const;
export const FLOORS = ["boards", "checker", "flagstones"] as const;
export const CEILINGS = ["plain", "beams"] as const;
export const SIDES = ["plain", "window"] as const;
export const ITEMS = ["desk", "showcase", "bookshelf", "safe", "door", "chest", "painting", "lamp", "plant", "clock", "window", "barrel", "rug"] as const;

export type WallPart = (typeof WALLS)[number];
export type FloorPart = (typeof FLOORS)[number];
export type CeilingPart = (typeof CEILINGS)[number];
export type SidePart = (typeof SIDES)[number];
export type ItemPart = (typeof ITEMS)[number];

/** The palette: every surface and item gets one of these colors (by id). */
export const COLORS = {
  slate: "#3f4d5c",
  stone: "#8a8580",
  sand: "#c8b48a",
  cream: "#e6dcc6",
  white: "#dfe6e9",
  brick: "#9a5238",
  wood: "#8a5c36",
  walnut: "#5a3b26",
  green: "#3f6b55",
  teal: "#2f6f73",
  blue: "#2f5577",
  red: "#7d2f2f",
  gold: "#c9a24a",
  black: "#2b2a2a",
} as const;
export type ColorId = keyof typeof COLORS;
export const COLOR_IDS = Object.keys(COLORS) as ColorId[];

/**
 * Where an item stands, in picture units: `w` × `h` with its bottom at `base` (the floor line for most, higher for
 * things on the wall, 0 for a hanging lamp). The stored `x` is its center in percent.
 */
export const ITEM_BOX: Record<ItemPart, { w: number; h: number; base: number }> = {
  desk: { w: 500, h: 250, base: 760 },
  showcase: { w: 240, h: 430, base: 730 },
  bookshelf: { w: 300, h: 500, base: 715 },
  safe: { w: 200, h: 180, base: 735 },
  door: { w: 220, h: 480, base: 711 },
  chest: { w: 230, h: 140, base: 770 },
  painting: { w: 260, h: 200, base: 380 },
  lamp: { w: 140, h: 200, base: 200 },
  plant: { w: 130, h: 260, base: 740 },
  clock: { w: 120, h: 420, base: 715 },
  window: { w: 260, h: 260, base: 460 },
  barrel: { w: 180, h: 220, base: 760 },
  rug: { w: 640, h: 90, base: 850 },
};

/** The box of a known item; unknown ids (and names like "constructor") have none. */
export function itemBox(part: string): { w: number; h: number; base: number } | null {
  return Object.hasOwn(ITEM_BOX, part) ? ITEM_BOX[part as ItemPart] : null;
}

/** Colors a new part starts with. */
export const DEFAULT_COLORS = {
  wall: { plaster: "slate", panels: "green", bricks: "stone", tiles: "white" } satisfies Record<WallPart, ColorId>,
  floor: { boards: "wood", checker: "cream", flagstones: "stone" } satisfies Record<FloorPart, ColorId>,
  ceiling: { plain: "cream", beams: "walnut" } satisfies Record<CeilingPart, ColorId>,
  side: { plain: "slate", window: "slate" } satisfies Record<SidePart, ColorId>,
  item: {
    desk: "wood",
    showcase: "walnut",
    bookshelf: "walnut",
    safe: "stone",
    door: "wood",
    chest: "wood",
    painting: "gold",
    lamp: "gold",
    plant: "sand",
    clock: "walnut",
    window: "white",
    barrel: "wood",
    rug: "red",
  } satisfies Record<ItemPart, ColorId>,
} as const;

// --- Format ---

/** A surface: which part, in which color. Ids are strings: unknown ones from newer apps are kept. */
export type Surface = { part: string; color: string };

/** An item against the back wall; later items lie in front of earlier ones. Room left for states (after M49). */
export type PlacedItem = { part: string; x: number; color: string; flip?: true };

export type Composition = {
  wall: Surface;
  floor: Surface;
  ceiling: Surface;
  left?: Surface;
  right?: Surface;
  items: readonly PlacedItem[];
};

export const COMPOSE_LIMITS = { items: 16 } as const;

const PART_ID = /^[a-z0-9-]{1,24}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function surface(value: unknown): Surface | null {
  if (!isRecord(value)) return null;
  const { part, color } = value;
  if (typeof part !== "string" || !PART_ID.test(part) || typeof color !== "string" || !PART_ID.test(color)) return null;
  return { part, color };
}

/** A clean copy of an untrusted composition, or null. Ids only need the right shape (see the top of this file). */
export function parseComposition(value: unknown): Composition | null {
  if (!isRecord(value)) return null;
  const wall = surface(value.wall);
  const floor = surface(value.floor);
  const ceiling = surface(value.ceiling);
  if (!wall || !floor || !ceiling) return null;
  const out: Composition = { wall, floor, ceiling, items: [] };
  for (const side of ["left", "right"] as const) {
    if (value[side] === undefined) continue;
    const s = surface(value[side]);
    if (!s) return null;
    out[side] = s;
  }
  if (!Array.isArray(value.items) || value.items.length > COMPOSE_LIMITS.items) return null;
  const items: PlacedItem[] = [];
  for (const raw of value.items) {
    const base = surface(raw);
    if (!base || !isRecord(raw)) return null;
    const { x, flip } = raw;
    if (typeof x !== "number" || !Number.isFinite(x) || x < 0 || x > 100) return null;
    if (flip !== undefined && flip !== true) return null;
    items.push(flip ? { part: base.part, x, color: base.color, flip: true } : { part: base.part, x, color: base.color });
  }
  out.items = items;
  return out;
}

const has = (list: readonly string[], id: string) => list.includes(id);

/** Parts and colors this version does not know, e.g. to refuse publishing them. */
export function unknownParts(c: Composition): string[] {
  const out: string[] = [];
  const check = (list: readonly string[], s: Surface | undefined) => {
    if (!s) return;
    if (!has(list, s.part)) out.push(s.part);
    if (!Object.hasOwn(COLORS, s.color)) out.push(s.color);
  };
  check(WALLS, c.wall);
  check(FLOORS, c.floor);
  check(CEILINGS, c.ceiling);
  check(SIDES, c.left);
  check(SIDES, c.right);
  for (const item of c.items) check(ITEMS, item);
  return out;
}

/** The hex value of a color id, or `fallback` (a color id) for unknown ones. */
export function colorOf(id: string, fallback: ColorId): string {
  return Object.hasOwn(COLORS, id) ? COLORS[id as ColorId] : COLORS[fallback];
}

// --- Editing (pure, never mutates) ---

/** A plain room to start from. */
export function newComposition(): Composition {
  return {
    wall: { part: "plaster", color: DEFAULT_COLORS.wall.plaster },
    floor: { part: "boards", color: DEFAULT_COLORS.floor.boards },
    ceiling: { part: "plain", color: DEFAULT_COLORS.ceiling.plain },
    items: [],
  };
}

export type SurfaceSlot = "wall" | "floor" | "ceiling" | "left" | "right";

/** The parts that fit a slot, and the color a newly chosen part starts with. */
export function slotParts(slot: SurfaceSlot): readonly string[] {
  return slot === "wall" ? WALLS : slot === "floor" ? FLOORS : slot === "ceiling" ? CEILINGS : SIDES;
}

function defaultColor(slot: SurfaceSlot, part: string): string {
  const table: Record<string, string> = slot === "left" || slot === "right" ? DEFAULT_COLORS.side : DEFAULT_COLORS[slot];
  return Object.hasOwn(table, part) ? table[part]! : "slate";
}

/** Picks another part for a slot (keeping its color only if the user chose one before); `null` removes a side wall. */
export function setPart(c: Composition, slot: SurfaceSlot, part: string | null): Composition {
  if (part === null) {
    if (slot !== "left" && slot !== "right") return c;
    const { [slot]: _removed, ...rest } = c;
    return rest;
  }
  const old = c[slot];
  if (old?.part === part) return c;
  const keep = old && old.color !== defaultColor(slot, old.part);
  return { ...c, [slot]: { part, color: keep ? old.color : defaultColor(slot, part) } };
}

export function setColor(c: Composition, slot: SurfaceSlot, color: string): Composition {
  const old = c[slot];
  return old ? { ...c, [slot]: { ...old, color } } : c;
}

const round = (n: number) => Math.round(n * 10) / 10;

/** Keeps an item inside the picture: its center between half its width and 100 % minus that. */
export function clampItemX(part: string, x: number): number {
  const box = itemBox(part);
  const half = box ? (box.w / 2 / PERSPECTIVE.width) * 100 : 0;
  return round(Math.min(100 - half, Math.max(half, x)));
}

/** Adds an item in front of all others, in the middle; `index` is -1 at the limit. */
export function addItem(c: Composition, part: ItemPart): { composition: Composition; index: number } {
  if (c.items.length >= COMPOSE_LIMITS.items) return { composition: c, index: -1 };
  const item: PlacedItem = { part, x: 50, color: DEFAULT_COLORS.item[part] };
  // A rug lies on the floor: behind everything else.
  const items = part === "rug" ? [item, ...c.items] : [...c.items, item];
  return { composition: { ...c, items }, index: part === "rug" ? 0 : items.length - 1 };
}

export function updateItem(c: Composition, index: number, change: { x?: number; color?: string; flip?: boolean }): Composition {
  const old = c.items[index];
  if (!old) return c;
  const next: PlacedItem = { part: old.part, x: change.x === undefined ? old.x : clampItemX(old.part, change.x), color: change.color ?? old.color };
  if (change.flip ?? old.flip) next.flip = true;
  return { ...c, items: c.items.map((item, i) => (i === index ? next : item)) };
}

/** Moves an item one step to the front (+1) or back (-1); returns its new index. */
export function reorderItem(c: Composition, index: number, step: 1 | -1): { composition: Composition; index: number } {
  const to = index + step;
  if (!c.items[index] || to < 0 || to >= c.items.length) return { composition: c, index };
  const items = [...c.items];
  [items[index], items[to]] = [items[to]!, items[index]!];
  return { composition: { ...c, items }, index: to };
}

export function removeItem(c: Composition, index: number): Composition {
  return c.items[index] ? { ...c, items: c.items.filter((_, i) => i !== index) } : c;
}

/** The box of an item in percent of the picture (like a tap area), e.g. for the editor's handles. */
export function itemRect(item: PlacedItem): { x: number; y: number; w: number; h: number } | null {
  const box = itemBox(item.part);
  if (!box) return null;
  const w = (box.w / PERSPECTIVE.width) * 100;
  const h = (box.h / PERSPECTIVE.height) * 100;
  return { x: item.x - w / 2, y: ((box.base - box.h) / PERSPECTIVE.height) * 100, w, h };
}
