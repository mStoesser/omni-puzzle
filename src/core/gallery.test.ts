import { test } from "node:test";
import assert from "node:assert/strict";
import { createApi } from "./api.ts";
import { DEFAULT_FILTER, fetchGalleryPage, formatGalleryFilter, galleryQuery, normalizeSearch, parseGalleryFilter, searchCondition } from "./gallery.ts";

test("galleryQuery: default is newest first, without hidden puzzles", () => {
  const q = galleryQuery(DEFAULT_FILTER, null, 21);
  assert.equal(q.order, "published_at.desc,id.desc");
  assert.equal(q.hidden, "is.false");
  assert.equal(q.limit, "21");
  assert.equal(q.type, undefined);
  assert.equal(q.or, undefined);
  assert.match(q.select!, /content_key/);
});

test("galleryQuery: filters and keyset cursor", () => {
  const q = galleryQuery({ view: "puzzles", type: "laser", level: 2, lang: "en", sort: "likes", q: null }, { value: 5, id: "abc" }, 21);
  assert.equal(q.type, "eq.laser");
  assert.equal(q.lang, "eq.en");
  assert.match(q.select!, /,lang,/);
  assert.match(q.select!, /,theme:doc->meta->theme,/); // M29: the card shows the board colors
  assert.match(q.select!, /,preview:preview_data,/); // M32: starting position for the card
  assert.equal(q.difficulty, "eq.2");
  assert.equal(q.order, "like_count.desc,id.desc");
  assert.equal(q.or, '(like_count.lt."5",and(like_count.eq."5",id.lt.abc))');
  const time = galleryQuery(DEFAULT_FILTER, { value: "2026-11-02T10:00:00.5+00:00", id: "x" }, 21);
  assert.equal(time.or, '(published_at.lt."2026-11-02T10:00:00.5+00:00",and(published_at.eq."2026-11-02T10:00:00.5+00:00",id.lt.x))');
});

test("fetchGalleryPage detects the next page with one extra row", async () => {
  const row = (i: number) => ({
    id: `id${i}`,
    type: "rushhour",
    title: `T${i}`,
    content_key: "k",
    min_moves: 3,
    difficulty: 1,
    like_count: 10 - i,
    play_count: 0,
    rating_sum: 0,
    rating_count: 0,
    published_at: "2026-11-02T10:00:00+00:00",
    hardness: 100003,
    author: i === 0 ? null : { username: "fan" },
    theme: i === 1 ? { colors: { board: "#ffffff", line: "#dddddd", wall: "#555555", figure: "#000000", piece: "#333333", accent: "#666666", target: "#222222", done: "#777777" } } : i === 0 ? { colors: "<script>" } : null,
    preview: i === 1 ? { typeVersion: 1, data: { width: 6 } } : null,
  });
  const replies = [[row(0), row(1), row(2)], [row(2)]];
  const fetch = (async () => new Response(JSON.stringify(replies.shift()))) as typeof globalThis.fetch;
  const api = createApi({ url: "https://abc.supabase.co", key: "k" }, { fetch });
  const filter = { ...DEFAULT_FILTER, sort: "likes" as const };

  const first = await fetchGalleryPage(api, filter, null, 2);
  assert.deepEqual(first.items.map((i) => i.id), ["id0", "id1"]);
  assert.equal(first.items[0]!.author, null);
  assert.equal(first.items[1]!.level, 1);
  assert.equal(first.items[0]!.theme, null); // invalid themes are ignored
  assert.equal(first.items[1]!.theme?.colors.board, "#ffffff");
  assert.equal(first.items[0]!.preview, null);
  assert.deepEqual(first.items[1]!.preview, { typeVersion: 1, data: { width: 6 } }); // checked when drawn
  assert.deepEqual(first.next, { value: 9, id: "id1" });

  const last = await fetchGalleryPage(api, filter, first.next, 2);
  assert.equal(last.items.length, 1);
  assert.equal(last.next, null);
});

test("gallery filters round-trip through the route; junk falls back to defaults", () => {
  const filter = { view: "puzzles" as const, type: "laser", level: 3 as const, lang: "de" as const, sort: "hardest" as const, q: null };
  assert.deepEqual(parseGalleryFilter(formatGalleryFilter(filter)), filter);
  assert.equal(formatGalleryFilter(DEFAULT_FILTER), "");
  assert.equal(formatGalleryFilter(filter), "type=laser&level=3&lang=de&sort=hardest");
  assert.deepEqual(parseGalleryFilter("type=Bad Type&level=7&lang=fr&sort=evil"), DEFAULT_FILTER);
});

test("the chain view keeps only its own sorts and drops type and level", () => {
  const chains = parseGalleryFilter("view=chains&type=laser&level=2&lang=en&sort=plays");
  assert.deepEqual(chains, { view: "chains", type: null, level: null, lang: null, sort: "plays", q: null });
  assert.equal(formatGalleryFilter(chains), "view=chains&sort=plays");
  assert.equal(parseGalleryFilter("view=chains&sort=likes").sort, "new");
  assert.equal(parseGalleryFilter("view=other").view, "puzzles");
});

test("normalizeSearch keeps letters, digits, dots, apostrophes and hyphens; the rest becomes spaces", () => {
  assert.equal(normalizeSearch("  Große   Halle "), "Große Halle");
  assert.equal(normalizeSearch("laser_lisa"), "laser lisa"); // _ is a LIKE wildcard
  assert.equal(normalizeSearch("a*b%c,d(e)f\"g\\h"), "a b c d e f g h");
  assert.equal(normalizeSearch("O'Brien's Spiegel-Welt 2.0"), "O'Brien's Spiegel-Welt 2.0");
  assert.equal(normalizeSearch("x"), null);
  assert.equal(normalizeSearch("*,"), null);
  assert.equal(normalizeSearch(null), null);
  assert.equal(normalizeSearch("y".repeat(100))!.length, 60);
});

test("searchCondition: every word must occur, lowercase, quoted, at most five words", () => {
  assert.equal(searchCondition("Große Halle"), '(search_text.ilike."*große*",search_text.ilike."*halle*")');
  assert.equal(searchCondition("a a b"), '(search_text.ilike."*a*",search_text.ilike."*b*")');
  assert.equal(searchCondition("1 2 3 4 5 6 7").split("ilike").length - 1, 5);
});

test("the search lives in the route, in both views, and combines with filters and the cursor", () => {
  const filter = parseGalleryFilter("type=laser&q=Spiegel%20Lisa");
  assert.equal(filter.q, "Spiegel Lisa");
  assert.equal(formatGalleryFilter(filter), "type=laser&q=Spiegel+Lisa");
  assert.equal(parseGalleryFilter("view=chains&q=Lager").q, "Lager");
  assert.equal(parseGalleryFilter("q=a").q, null);
  const query = galleryQuery(filter, { value: 3, id: "x" }, 21);
  assert.equal(query.and, '(search_text.ilike."*spiegel*",search_text.ilike."*lisa*")');
  assert.equal(query.type, "eq.laser");
  assert.match(query.or!, /published_at/);
  assert.equal(galleryQuery(DEFAULT_FILTER, null, 21).and, undefined);
});
