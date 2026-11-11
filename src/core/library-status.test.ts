import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addSharedKey,
  formatLibraryFilter,
  libraryStatus,
  matchesTitle,
  matchesFilter,
  MAX_SHARED_KEYS,
  parseLibraryFilter,
  parseSharedKeys,
} from "./library-status.ts";

const key = (n: number) => n.toString(16).padStart(64, "0");

test("gallery beats link beats ready beats draft, by content key", () => {
  const known = { published: new Set([key(1)]), shared: new Set([key(1), key(2)]) };
  assert.equal(libraryStatus(key(1), true, known), "gallery");
  assert.equal(libraryStatus(key(2), false, known), "link");
  assert.equal(libraryStatus(key(3), true, known), "ready");
  assert.equal(libraryStatus(key(3), false, known), "draft");
});

test("a changed puzzle (other key) or one with problems (no key) is a draft again", () => {
  const known = { published: new Set([key(1)]), shared: new Set([key(2)]) };
  assert.equal(libraryStatus(key(9), false, known), "draft");
  assert.equal(libraryStatus(null, true, known), "ready");
});

test("without published keys (signed out, not loaded yet) only links count", () => {
  const known = { published: null, shared: new Set([key(1)]) };
  assert.equal(libraryStatus(key(1), true, known), "link");
});

test("the filters: drafts are everything not shared, ready or not", () => {
  assert.deepEqual((["gallery", "link", "ready", "draft"] as const).filter((s) => matchesFilter(s, "shared")), ["gallery", "link"]);
  assert.deepEqual((["gallery", "link", "ready", "draft"] as const).filter((s) => matchesFilter(s, "drafts")), ["ready", "draft"]);
  assert.ok((["gallery", "link", "ready", "draft"] as const).every((s) => matchesFilter(s, "all")));
});

test("the filter lives in the route; unknown values mean all", () => {
  assert.equal(parseLibraryFilter("filter=drafts"), "drafts");
  assert.equal(parseLibraryFilter("filter=shared"), "shared");
  assert.equal(parseLibraryFilter("filter=evil"), "all");
  assert.equal(parseLibraryFilter(""), "all");
  assert.equal(formatLibraryFilter("all"), "");
  assert.equal(formatLibraryFilter("shared"), "filter=shared");
});

test("shared keys: newest first, no duplicates, capped, malformed ones dropped", () => {
  assert.deepEqual(parseSharedKeys([key(1), "x", 3, key(1), key(2)]), [key(1), key(2)]);
  assert.deepEqual(parseSharedKeys(null), []);
  const list = addSharedKey([key(1), key(2)], key(2));
  assert.deepEqual(list, [key(2), key(1)]);
  const same = [key(2), key(1)];
  assert.equal(addSharedKey(same, key(2)), same);
  assert.equal(addSharedKey(same, "nope"), same);
  const full = Array.from({ length: MAX_SHARED_KEYS }, (_, i) => key(i + 1));
  const added = addSharedKey(full, key(9999));
  assert.equal(added.length, MAX_SHARED_KEYS);
  assert.equal(added[0], key(9999));
  assert.equal(added.at(-1), key(MAX_SHARED_KEYS - 1));
});

test("the local title search needs every word, in any case and order", () => {
  assert.equal(matchesTitle("Große Lagerhalle", "lager"), true);
  assert.equal(matchesTitle("Große Lagerhalle", "HALLE große"), true);
  assert.equal(matchesTitle("Große Lagerhalle", "lager kiste"), false);
  assert.equal(matchesTitle("Große Lagerhalle", "  "), true);
});
