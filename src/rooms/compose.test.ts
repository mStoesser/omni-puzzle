import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COLORS,
  COMPOSE_LIMITS,
  DEFAULT_COLORS,
  FLOORS,
  ITEMS,
  ITEM_BOX,
  PERSPECTIVE,
  addItem,
  clampItemX,
  colorOf,
  itemBox,
  itemRect,
  newComposition,
  parseComposition,
  removeItem,
  reorderItem,
  setColor,
  setPart,
  unknownParts,
  updateItem,
} from "./compose.ts";
import type { Composition } from "./compose.ts";

const sample = (): Composition => ({
  wall: { part: "bricks", color: "stone" },
  floor: { part: "checker", color: "cream" },
  ceiling: { part: "beams", color: "walnut" },
  left: { part: "window", color: "slate" },
  items: [
    { part: "rug", x: 50, color: "red" },
    { part: "desk", x: 30, color: "wood", flip: true },
  ],
});

test("the perspective: the back wall is the picture scaled around the vanishing point", () => {
  const { vanish: v, scale, back, width, height } = PERSPECTIVE;
  assert.equal(back.left, v.x - v.x * scale);
  assert.equal(back.right, v.x + (width - v.x) * scale);
  assert.equal(back.top, v.y - v.y * scale);
  assert.equal(back.bottom, v.y + (height - v.y) * scale);
});

test("every item fits into the picture, and every part has a default color from the palette", () => {
  for (const part of ITEMS) {
    const box = ITEM_BOX[part];
    assert.ok(box.w <= PERSPECTIVE.width && box.base <= PERSPECTIVE.height && box.base - box.h >= 0, part);
    assert.ok(Object.hasOwn(COLORS, DEFAULT_COLORS.item[part]), part);
  }
  for (const part of FLOORS) assert.ok(Object.hasOwn(COLORS, DEFAULT_COLORS.floor[part]));
});

test("parsing keeps a clean copy and drops unknown fields", () => {
  const raw = structuredClone(sample()) as any;
  raw.extra = 1;
  raw.wall.shine = true;
  raw.items[0].state = "open";
  assert.deepEqual(parseComposition(raw), sample());
  assert.deepEqual(parseComposition(newComposition()), newComposition());
});

test("parsing refuses what is malformed", () => {
  const bad = (change: (c: any) => void) => {
    const c = structuredClone(sample()) as any;
    change(c);
    assert.equal(parseComposition(c), null);
  };
  bad((c) => delete c.wall);
  bad((c) => (c.floor = "boards"));
  bad((c) => (c.ceiling.part = "Beams!"));
  bad((c) => (c.right = { part: "plain" }));
  bad((c) => (c.items = {}));
  bad((c) => (c.items = Array(COMPOSE_LIMITS.items + 1).fill({ part: "desk", x: 50, color: "wood" })));
  bad((c) => (c.items[0].x = 101));
  bad((c) => (c.items[0].x = Number.NaN));
  bad((c) => (c.items[0].x = "50"));
  bad((c) => (c.items[0].flip = false));
  assert.equal(parseComposition(null), null);
  assert.equal(parseComposition([]), null);
});

test("ids from newer apps are kept (tolerant), but listed as unknown", () => {
  const c = sample() as any;
  c.wall = { part: "wallpaper", color: "pink" };
  c.items = [...c.items, { part: "robot", x: 10, color: "gold" }];
  const parsed = parseComposition(c)!;
  assert.equal(parsed.wall.part, "wallpaper");
  assert.equal(parsed.items[2]!.part, "robot");
  assert.deepEqual(unknownParts(parsed), ["wallpaper", "pink", "robot"]);
  assert.deepEqual(unknownParts(sample()), []);
  assert.equal(colorOf("pink", "slate"), COLORS.slate);
  assert.equal(colorOf("constructor", "red"), COLORS.red);
  assert.equal(itemBox("constructor"), null);
  assert.equal(itemRect({ part: "robot", x: 10, color: "gold" }), null);
});

test("choosing parts: a new part brings its default color unless a color was chosen; side walls can be removed", () => {
  const c = newComposition();
  const panels = setPart(c, "wall", "panels");
  assert.deepEqual(panels.wall, { part: "panels", color: DEFAULT_COLORS.wall.panels });
  const red = setColor(panels, "wall", "red");
  assert.deepEqual(setPart(red, "wall", "bricks").wall, { part: "bricks", color: "red" });
  assert.equal(setPart(c, "wall", "plaster"), c);
  const left = setPart(c, "left", "window");
  assert.deepEqual(left.left, { part: "window", color: DEFAULT_COLORS.side.window });
  assert.equal("left" in setPart(left, "left", null), false);
  assert.equal(setPart(c, "floor", null), c); // floor, wall and ceiling are required
  assert.equal(setColor(c, "right", "red"), c); // no right wall to color
  assert.deepEqual(c, newComposition()); // nothing was mutated
});

test("items: added in the middle and in front (a rug behind), moved inside the picture, mirrored, reordered, removed", () => {
  let c = newComposition();
  const desk = addItem(c, "desk");
  assert.equal(desk.index, 0);
  c = desk.composition;
  c = addItem(c, "safe").composition;
  const rug = addItem(c, "rug");
  assert.equal(rug.index, 0);
  c = rug.composition;
  assert.deepEqual(c.items.map((i) => i.part), ["rug", "desk", "safe"]);

  // The desk is 500 of 1600 units wide: its center stays between 15.6 % and 84.4 %.
  assert.equal(updateItem(c, 1, { x: 0 }).items[1]!.x, 15.6);
  assert.equal(updateItem(c, 1, { x: 100 }).items[1]!.x, 84.4);
  assert.equal(updateItem(c, 1, { x: 33.333 }).items[1]!.x, 33.3);
  assert.equal(clampItemX("robot", 120), 100);

  const flipped = updateItem(c, 1, { flip: true });
  assert.equal(flipped.items[1]!.flip, true);
  assert.equal("flip" in updateItem(flipped, 1, { flip: false }).items[1]!, false);
  assert.equal(updateItem(flipped, 1, { color: "black" }).items[1]!.flip, true);

  const front = reorderItem(c, 1, 1);
  assert.equal(front.index, 2);
  assert.deepEqual(front.composition.items.map((i) => i.part), ["rug", "safe", "desk"]);
  assert.equal(reorderItem(c, 0, -1).composition, c);
  assert.deepEqual(removeItem(c, 0).items.map((i) => i.part), ["desk", "safe"]);
  assert.equal(removeItem(c, 7), c);
  assert.equal(updateItem(c, 7, { x: 3 }), c);
});

test("at most COMPOSE_LIMITS.items items", () => {
  let c = newComposition();
  for (let i = 0; i < COMPOSE_LIMITS.items; i++) c = addItem(c, "plant").composition;
  const full = addItem(c, "plant");
  assert.equal(full.index, -1);
  assert.equal(full.composition, c);
});

test("an item's box in percent, like a tap area", () => {
  const r = itemRect({ part: "door", x: 50, color: "wood" })!;
  assert.deepEqual(
    [r.x, r.y, r.w, r.h].map((n) => Math.round(n * 100) / 100),
    [43.13, 25.67, 13.75, 53.33],
  );
});

test("a full composition stays small (the gallery cover column allows 4 KB)", () => {
  let c = sample();
  c = { ...c, right: { part: "plain", color: "slate" } };
  while (c.items.length < COMPOSE_LIMITS.items) c = addItem(c, "bookshelf").composition;
  c = { ...c, items: c.items.map((item, i) => ({ ...item, x: 12.3 + i, flip: true as const })) };
  assert.ok(JSON.stringify({ compose: c }).length < 1500);
});
