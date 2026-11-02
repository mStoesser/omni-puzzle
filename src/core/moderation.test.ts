import { test } from "node:test";
import assert from "node:assert/strict";
import { createApi } from "./api.ts";
import { fetchModerationQueue, releasePuzzle, reportPuzzle, setBanned } from "./moderation.ts";

type Call = { url: string; init: RequestInit };

function fakeApi(replies: unknown[], calls: Call[]) {
  const fetch = (async (url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    const body = replies.shift();
    return new Response(body === undefined ? null : JSON.stringify(body), { status: body === undefined ? 204 : 200 });
  }) as typeof globalThis.fetch;
  return createApi({ url: "https://abc.supabase.co", key: "k" }, { fetch, accessToken: () => "jwt" });
}

test("reportPuzzle sends one row with a trimmed, capped comment", async () => {
  const calls: Call[] = [];
  await reportPuzzle(fakeApi([undefined], calls), "u", "p", "spam", `  ${"x".repeat(600)} `);
  const body = JSON.parse(String(calls[0]!.init.body));
  assert.equal(body.reason, "spam");
  assert.equal(body.reporter_id, "u");
  assert.equal(body.comment.length, 500);
});

test("fetchModerationQueue asks for hidden or reported puzzles with open reports", async () => {
  const calls: Call[] = [];
  const row = {
    id: "p",
    type: "laser",
    title: "T",
    hidden: true,
    published_at: "2026-11-03T10:00:00+00:00",
    author: { id: "a", username: "autor", banned: false, is_moderator: false },
    reports: [{ reason: "spam", comment: "", created_at: "2026-11-03T11:00:00+00:00", reporter: null }],
  };
  const [item] = await fetchModerationQueue(fakeApi([[row]], calls));
  const url = new URL(calls[0]!.url);
  assert.equal(url.searchParams.get("or"), "(hidden.is.true,report_count.gt.0)");
  assert.equal(url.searchParams.get("reports.resolved"), "is.false");
  assert.equal(item?.author?.username, "autor");
  assert.equal(item?.reports[0]?.reporter, null);
});

test("moderator actions are RPCs", async () => {
  const calls: Call[] = [];
  const api = fakeApi([undefined, undefined], calls);
  await releasePuzzle(api, "p");
  await setBanned(api, "u", true);
  assert.match(calls[0]!.url, /rpc\/mod_release_puzzle$/);
  assert.equal(calls[1]!.init.body, '{"target":"u","ban":true}');
});
