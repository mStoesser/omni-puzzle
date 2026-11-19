import { test } from "node:test";
import assert from "node:assert/strict";
import { formatAddress, formatRoute, hrefWithMode, linkMode, modeFits, parseAddress, parseRoute, takesMode } from "./router.ts";
import type { Route } from "./router.ts";

test("parses all known routes", () => {
  assert.deepEqual(parseRoute(""), { name: "home" });
  assert.deepEqual(parseRoute("#"), { name: "home" });
  assert.deepEqual(parseRoute("#/"), { name: "home" });
  assert.deepEqual(parseRoute("#/library"), { name: "library", filter: "all" });
  assert.deepEqual(parseRoute("#/library?filter=shared"), { name: "library", filter: "shared" });
  assert.deepEqual(parseRoute("#/library?x=1"), { name: "library", filter: "all" }); // like the gallery: unknown = default
  assert.deepEqual(parseRoute("#/impressum"), { name: "imprint" });
  assert.deepEqual(parseRoute("#/datenschutz"), { name: "privacy" });
  assert.deepEqual(parseRoute("#/account"), { name: "account" });
  assert.deepEqual(parseRoute("#/moderation"), { name: "moderation" });
  assert.deepEqual(parseRoute("#/daily"), { name: "daily" });
  assert.deepEqual(parseRoute("#/daily/x"), { name: "home" });
  assert.deepEqual(parseRoute("#/gallery"), { name: "gallery", filter: { view: "puzzles", type: null, level: null, lang: null, sort: "new", q: null } });
  assert.deepEqual(parseRoute("#/gallery?type=laser&sort=likes"), {
    name: "gallery",
    filter: { view: "puzzles", type: "laser", level: null, lang: null, sort: "likes", q: null },
  });
  assert.deepEqual(parseRoute("#/p/1.abc_-XYZ"), { name: "shared", code: "1.abc_-XYZ" });
  assert.deepEqual(parseRoute("#/new/rushhour"), { name: "new", type: "rushhour" });
  assert.deepEqual(parseRoute("#/edit/a1-b2"), { name: "edit", id: "a1-b2" });
  assert.deepEqual(parseRoute("#/play/a1_b2"), { name: "play", id: "a1_b2" });
  assert.deepEqual(parseRoute("#/g/8c0f4f0e-1d2b-4c3a-9e8f-0a1b2c3d4e5f"), {
    name: "published",
    id: "8c0f4f0e-1d2b-4c3a-9e8f-0a1b2c3d4e5f",
  });
});

test("unknown or malformed routes lead to home", () => {
  for (const hash of [
    "#/nope",
    "#/library/x",
    "#/impressum/x",
    "#/play",
    "#/play/",
    "#/play/a/b",
    "#/new/Rush Hour",
    "#/p/<script>",
    "#/edit/" + "x".repeat(65),
    "#/g/abc",
    "#/g/8C0F4F0E-1D2B-4C3A-9E8F-0A1B2C3D4E5F",
    "#/c/abc",
    "#/c/8c0f4f0e-1d2b-4c3a-9e8f-0a1b2c3d4e5f/0",
    "#/c/8c0f4f0e-1d2b-4c3a-9e8f-0a1b2c3d4e5f/01",
    "#/c/8c0f4f0e-1d2b-4c3a-9e8f-0a1b2c3d4e5f/100",
    "#/c/8c0f4f0e-1d2b-4c3a-9e8f-0a1b2c3d4e5f/1/2",
    "#/chain/edit",
  ]) {
    assert.deepEqual(parseRoute(hash), { name: "home" }, hash);
  }
});

test("formatRoute and parseRoute round-trip", () => {
  const routes: Route[] = [
    { name: "home" },
    { name: "library", filter: "all" },
    { name: "library", filter: "drafts" },
    { name: "imprint" },
    { name: "privacy" },
    { name: "account" },
    { name: "moderation" },
    { name: "daily" },
    { name: "gallery", filter: { view: "puzzles", type: null, level: null, lang: null, sort: "new", q: null } },
    { name: "gallery", filter: { view: "puzzles", type: "quiz", level: 2, lang: "en", sort: "plays", q: null } },
    { name: "gallery", filter: { view: "chains", type: null, level: null, lang: null, sort: "plays", q: null } },
    { name: "chain", id: "8c0f4f0e-1d2b-4c3a-9e8f-0a1b2c3d4e5f", step: null },
    { name: "chain", id: "8c0f4f0e-1d2b-4c3a-9e8f-0a1b2c3d4e5f", step: 20 },
    { name: "chainNew" },
    { name: "shared", code: "1.abc" },
    { name: "new", type: "laser" },
    { name: "edit", id: "x1" },
    { name: "play", id: "x2" },
    { name: "published", id: "8c0f4f0e-1d2b-4c3a-9e8f-0a1b2c3d4e5f" },
    { name: "room", id: "room-study" },
    { name: "roomEdit", id: "x3" },
  ];
  for (const route of routes) assert.deepEqual(parseRoute(formatRoute(route)), route);
  assert.deepEqual(parseRoute("#/room/a b"), { name: "home" });
  assert.equal(takesMode({ name: "room", id: "room-study" }), false); // always shown on its own full screen stage
});

const GALLERY_ID = "8c0f4f0e-1d2b-4c3a-9e8f-0a1b2c3d4e5f";

test("puzzle routes carry a mode (M41)", () => {
  assert.deepEqual(parseAddress("#/p/1.abc?mode=full"), { route: { name: "shared", code: "1.abc" }, mode: "full" });
  assert.deepEqual(parseAddress(`#/g/${GALLERY_ID}?mode=full`), { route: { name: "published", id: GALLERY_ID }, mode: "full" });
  assert.deepEqual(parseAddress(`#/c/${GALLERY_ID}?mode=full`), { route: { name: "chain", id: GALLERY_ID, step: null }, mode: "full" });
  assert.deepEqual(parseAddress(`#/c/${GALLERY_ID}/3?mode=full`), { route: { name: "chain", id: GALLERY_ID, step: 3 }, mode: "full" });
  assert.deepEqual(parseAddress("#/play/laser-1?mode=full"), { route: { name: "play", id: "laser-1" }, mode: "full" });
  assert.deepEqual(parseAddress("#/daily?mode=full"), { route: { name: "daily" }, mode: "full" });
  assert.deepEqual(parseAddress("#/p/1.abc"), { route: { name: "shared", code: "1.abc" }, mode: null });
});

test("an unknown mode means the normal view; other query parts are still rejected", () => {
  assert.deepEqual(parseAddress("#/p/1.abc?mode=kiosk"), { route: { name: "shared", code: "1.abc" }, mode: null });
  for (const hash of ["#/p/1.abc?mode=", "#/p/1.abc?mode=FULL", "#/p/1.abc?mode=full&x=1", "#/p/1.abc?x=1", "#/p/1.abc?mode=full?x"]) {
    assert.deepEqual(parseAddress(hash), { route: { name: "home" }, mode: null }, hash);
  }
  // Routes without a puzzle ignore no mode: they keep their old behavior.
  assert.deepEqual(parseAddress("#/edit/x1?mode=full"), { route: { name: "home" }, mode: null });
  assert.deepEqual(parseAddress("#/new/laser?mode=full"), { route: { name: "home" }, mode: null });
  assert.deepEqual(parseAddress("#/library?mode=full"), { route: { name: "library", filter: "all" }, mode: null });
  assert.equal(parseAddress("#/gallery?mode=full").route.name, "gallery");
  assert.deepEqual(parseAddress("#/gallery?mode=full").mode, null);
});

test("formatAddress round-trips and leaves routes without a puzzle alone", () => {
  const routes: Route[] = [
    { name: "shared", code: "1.abc" },
    { name: "published", id: GALLERY_ID },
    { name: "chain", id: GALLERY_ID, step: null },
    { name: "chain", id: GALLERY_ID, step: 2 },
    { name: "play", id: "x2" },
    { name: "daily" },
  ];
  for (const route of routes) {
    assert.ok(takesMode(route));
    for (const mode of ["full", null] as const) assert.deepEqual(parseAddress(formatAddress(route, mode)), { route, mode });
    if (route.name !== "chain") assert.deepEqual(parseAddress(formatAddress(route, "escape")), { route, mode: "escape" });
  }
  assert.equal(formatAddress({ name: "shared", code: "1.abc" }, "full"), "#/p/1.abc?mode=full");
  assert.equal(formatAddress({ name: "edit", id: "x1" }, "full"), "#/edit/x1");
  assert.equal(formatAddress({ name: "home" }, "full"), "#/");
  assert.equal(takesMode({ name: "edit", id: "x1" }), false);
});

test("escape mode (M42) for single puzzles, not for chains yet", () => {
  assert.deepEqual(parseAddress("#/p/1.abc?mode=escape"), { route: { name: "shared", code: "1.abc" }, mode: "escape" });
  assert.deepEqual(parseAddress(`#/g/${GALLERY_ID}?mode=escape`), { route: { name: "published", id: GALLERY_ID }, mode: "escape" });
  assert.deepEqual(parseAddress("#/daily?mode=escape"), { route: { name: "daily" }, mode: "escape" });
  assert.deepEqual(parseAddress(`#/c/${GALLERY_ID}/2?mode=escape`), { route: { name: "chain", id: GALLERY_ID, step: 2 }, mode: null });
  assert.deepEqual(parseAddress(`#/c/${GALLERY_ID}?mode=escape`), { route: { name: "chain", id: GALLERY_ID, step: null }, mode: null });
  assert.equal(formatAddress({ name: "chain", id: GALLERY_ID, step: 2 }, "escape"), `#/c/${GALLERY_ID}/2`);
  assert.equal(modeFits({ name: "chain", id: GALLERY_ID, step: 2 }, "full"), true);
  assert.equal(modeFits({ name: "chain", id: GALLERY_ID, step: 2 }, "escape"), false);
  assert.equal(modeFits({ name: "edit", id: "x1" }, "escape"), false);
});

test("share links open in escape mode when the puzzle has a result, otherwise in full screen", () => {
  assert.equal(linkMode(true), "escape");
  assert.equal(linkMode(false), "full");
});

test("hrefWithMode switches the mode of a link", () => {
  assert.equal(hrefWithMode("#/play/laser-2", "full"), "#/play/laser-2?mode=full");
  assert.equal(hrefWithMode("#/play/laser-2?mode=full", null), "#/play/laser-2");
  assert.equal(hrefWithMode(`#/c/${GALLERY_ID}/2`, "full"), `#/c/${GALLERY_ID}/2?mode=full`);
  assert.equal(hrefWithMode("#/library", "full"), "#/library");
});
