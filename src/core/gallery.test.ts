import { test } from "node:test";
import assert from "node:assert/strict";
import { createApi } from "./api.ts";
import { DEFAULT_FILTER, fetchGalleryPage, formatGalleryFilter, galleryQuery, parseGalleryFilter } from "./gallery.ts";

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
  const q = galleryQuery({ type: "laser", level: 2, sort: "likes" }, { value: 5, id: "abc" }, 21);
  assert.equal(q.type, "eq.laser");
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
  });
  const replies = [[row(0), row(1), row(2)], [row(2)]];
  const fetch = (async () => new Response(JSON.stringify(replies.shift()))) as typeof globalThis.fetch;
  const api = createApi({ url: "https://abc.supabase.co", key: "k" }, { fetch });
  const filter = { ...DEFAULT_FILTER, sort: "likes" as const };

  const first = await fetchGalleryPage(api, filter, null, 2);
  assert.deepEqual(first.items.map((i) => i.id), ["id0", "id1"]);
  assert.equal(first.items[0]!.author, null);
  assert.equal(first.items[1]!.level, 1);
  assert.deepEqual(first.next, { value: 9, id: "id1" });

  const last = await fetchGalleryPage(api, filter, first.next, 2);
  assert.equal(last.items.length, 1);
  assert.equal(last.next, null);
});

test("gallery filters round-trip through the route; junk falls back to defaults", () => {
  const filter = { type: "laser", level: 3 as const, sort: "hardest" as const };
  assert.deepEqual(parseGalleryFilter(formatGalleryFilter(filter)), filter);
  assert.equal(formatGalleryFilter(DEFAULT_FILTER), "");
  assert.deepEqual(parseGalleryFilter("type=Bad Type&level=7&sort=evil"), DEFAULT_FILTER);
});
