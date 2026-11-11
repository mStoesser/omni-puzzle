import { test } from "node:test";
import assert from "node:assert/strict";
import { formatRoute, parseRoute } from "./router.ts";
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
  ];
  for (const route of routes) assert.deepEqual(parseRoute(formatRoute(route)), route);
});
