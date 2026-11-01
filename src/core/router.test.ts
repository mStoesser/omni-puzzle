import { test } from "node:test";
import assert from "node:assert/strict";
import { formatRoute, parseRoute } from "./router.ts";
import type { Route } from "./router.ts";

test("parses all known routes", () => {
  assert.deepEqual(parseRoute(""), { name: "home" });
  assert.deepEqual(parseRoute("#"), { name: "home" });
  assert.deepEqual(parseRoute("#/"), { name: "home" });
  assert.deepEqual(parseRoute("#/library"), { name: "library" });
  assert.deepEqual(parseRoute("#/impressum"), { name: "imprint" });
  assert.deepEqual(parseRoute("#/datenschutz"), { name: "privacy" });
  assert.deepEqual(parseRoute("#/p/1.abc_-XYZ"), { name: "shared", code: "1.abc_-XYZ" });
  assert.deepEqual(parseRoute("#/new/rushhour"), { name: "new", type: "rushhour" });
  assert.deepEqual(parseRoute("#/edit/a1-b2"), { name: "edit", id: "a1-b2" });
  assert.deepEqual(parseRoute("#/play/a1_b2"), { name: "play", id: "a1_b2" });
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
  ]) {
    assert.deepEqual(parseRoute(hash), { name: "home" }, hash);
  }
});

test("formatRoute and parseRoute round-trip", () => {
  const routes: Route[] = [
    { name: "home" },
    { name: "library" },
    { name: "imprint" },
    { name: "privacy" },
    { name: "shared", code: "1.abc" },
    { name: "new", type: "laser" },
    { name: "edit", id: "x1" },
    { name: "play", id: "x2" },
  ];
  for (const route of routes) assert.deepEqual(parseRoute(formatRoute(route)), route);
});
