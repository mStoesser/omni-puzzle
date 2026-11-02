import { test } from "node:test";
import assert from "node:assert/strict";
import { createApi } from "./api.ts";
import { applyRating, averageRating, fetchMyReaction, formatAverage, setLike, setRating } from "./reactions.ts";

type Call = { url: string; init: RequestInit };

function fakeApi(replies: unknown[], calls: Call[]) {
  const fetch = (async (url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    const body = replies.shift();
    return new Response(body === undefined ? null : JSON.stringify(body), { status: body === undefined ? 204 : 200 });
  }) as typeof globalThis.fetch;
  return createApi({ url: "https://abc.supabase.co", key: "k" }, { fetch, accessToken: () => "jwt" });
}

test("fetchMyReaction reads the own like and rating", async () => {
  const calls: Call[] = [];
  const api = fakeApi([[{ puzzle_id: "p" }], [{ value: 4 }]], calls);
  assert.deepEqual(await fetchMyReaction(api, "u", "p"), { liked: true, rating: 4 });
  assert.match(calls[0]!.url, /\/likes\?user_id=eq\.u&puzzle_id=eq\.p/);
  assert.match(calls[1]!.url, /\/ratings\?user_id=eq\.u&puzzle_id=eq\.p&select=value/);
  assert.deepEqual(await fetchMyReaction(fakeApi([[], []], []), "u", "p"), { liked: false, rating: null });
});

test("setLike inserts or deletes the own row", async () => {
  const calls: Call[] = [];
  const api = fakeApi([undefined, undefined], calls);
  await setLike(api, "u", "p", true);
  await setLike(api, "u", "p", false);
  assert.equal(calls[0]!.init.method, "POST");
  assert.equal(calls[0]!.init.body, '{"user_id":"u","puzzle_id":"p"}');
  assert.equal(calls[1]!.init.method, "DELETE");
  assert.match(calls[1]!.url, /user_id=eq\.u&puzzle_id=eq\.p/);
});

test("setRating inserts the first rating and patches only the value later", async () => {
  const calls: Call[] = [];
  const api = fakeApi([undefined, undefined], calls);
  await setRating(api, "u", "p", 3, false);
  await setRating(api, "u", "p", 5, true);
  assert.equal(calls[0]!.init.method, "POST");
  assert.equal(calls[1]!.init.method, "PATCH");
  assert.equal(calls[1]!.init.body, '{"value":5}');
});

test("averages appear from three ratings on; optimistic counters", () => {
  assert.equal(averageRating(9, 2), null);
  assert.equal(averageRating(10, 3), 10 / 3);
  assert.equal(formatAverage(10 / 3), "3,3");
  assert.equal(formatAverage(4), "4,0");
  assert.deepEqual(applyRating({ ratingSum: 7, ratingCount: 2 }, null, 4), { ratingSum: 11, ratingCount: 3 });
  assert.deepEqual(applyRating({ ratingSum: 7, ratingCount: 2 }, 3, 5), { ratingSum: 9, ratingCount: 2 });
});
