import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiError, createApi } from "./api.ts";
import { PUBLISHED_ID, fetchPublished, listOwnPublications, publishErrorText, publishPuzzle } from "./published.ts";

type Call = { url: string; init: RequestInit };

function fakeApi(replies: { status: number; body?: unknown }[], calls: Call[]) {
  const fetch = (async (url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    const reply = replies.shift()!;
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), { status: reply.status });
  }) as typeof globalThis.fetch;
  return createApi({ url: "https://abc.supabase.co", key: "k" }, { fetch, accessToken: () => "user-jwt" });
}

const ROW = {
  id: "8c0f4f0e-1d2b-4c3a-9e8f-0a1b2c3d4e5f",
  doc: { format: 1 },
  type: "rushhour",
  title: "T",
  description: "",
  play_count: 2,
  like_count: 1,
  published_at: "2026-11-02T10:00:00+00:00",
  hidden: false,
  author: { username: "fan" },
};

test("fetchPublished embeds the author and maps the row", async () => {
  const calls: Call[] = [];
  const api = fakeApi([{ status: 200, body: [ROW] }, { status: 200, body: [] }], calls);
  const puzzle = await fetchPublished(api, ROW.id);
  assert.equal(puzzle?.author, "fan");
  assert.equal(puzzle?.playCount, 2);
  assert.match(calls[0]!.url, /select=id%2Cdoc%2C.*author%3Aprofiles%21puzzles_author_id_fkey%28username%29/);
  assert.equal(await fetchPublished(api, ROW.id), null);
});

test("listOwnPublications filters by author, newest first", async () => {
  const calls: Call[] = [];
  const api = fakeApi([{ status: 200, body: [ROW] }], calls);
  const [own] = await listOwnPublications(api, "u1");
  assert.equal(own?.type, "rushhour");
  const url = new URL(calls[0]!.url);
  assert.equal(url.searchParams.get("author_id"), "eq.u1");
  assert.equal(url.searchParams.get("order"), "published_at.desc");
});

test("publishPuzzle calls the function with the user's token", async () => {
  const calls: Call[] = [];
  const api = fakeApi([{ status: 201, body: { id: ROW.id } }, { status: 429, body: { error: "daily-limit" } }], calls);
  assert.equal(await publishPuzzle(api, { doc: {}, title: "T", description: "" }), ROW.id);
  assert.equal(calls[0]!.url, "https://abc.supabase.co/functions/v1/publish");
  assert.equal((calls[0]!.init.headers as Record<string, string>).Authorization, "Bearer user-jwt");
  const error = await publishPuzzle(api, { doc: {}, title: "T", description: "" }).catch((e: unknown) => e);
  assert.equal(publishErrorText(error), "publishDailyLimit");
});

test("publishErrorText falls back to API texts; ids are UUIDs", () => {
  assert.equal(publishErrorText(new ApiError("conflict", 409, "", "duplicate")), "publishDuplicate");
  assert.equal(publishErrorText(new ApiError("offline", 0)), "apiOffline");
  assert.ok(PUBLISHED_ID.test(ROW.id));
  assert.ok(!PUBLISHED_ID.test("../etc"));
});
