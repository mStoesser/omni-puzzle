import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiError, createApi } from "../core/api.ts";
import {
  fetchPublishedRoom,
  fetchRoomPage,
  parseCover,
  registerRoomPlay,
  reportRoom,
  roomGalleryQuery,
  roomPublishErrorPuzzle,
  roomPublishErrorText,
  withdrawRoom,
} from "./published.ts";

type Call = { url: string; init: RequestInit };

function fakeApi(replies: { status: number; body?: unknown }[], calls: Call[]) {
  const fetch = (async (url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    const reply = replies.shift()!;
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), { status: reply.status });
  }) as typeof globalThis.fetch;
  return createApi({ url: "https://abc.supabase.co", key: "k" }, { fetch, accessToken: () => "jwt" });
}

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const row = (n: number) => ({
  id: id(n),
  title: `Raum ${n}`,
  content_key: String(n).repeat(64).slice(0, 64),
  cover: n === 2 ? { key: "a".repeat(64) } : { builtin: "study" },
  scene_count: 2,
  puzzle_count: 1,
  lang: "de",
  play_count: 10 - n,
  published_at: `2026-11-2${n}T00:00:00Z`,
  author: n === 3 ? null : { username: "lisa" },
});

test("covers are a built-in name or an image key; anything else is dropped", () => {
  assert.deepEqual(parseCover({ builtin: "hall" }), { builtin: "hall" });
  assert.deepEqual(parseCover({ key: "b".repeat(64) }), { key: "b".repeat(64) });
  assert.equal(parseCover({ builtin: "hall", key: "b".repeat(64) }), null);
  assert.equal(parseCover({ builtin: "<svg>" }), null);
  assert.equal(parseCover({ key: "nope" }), null);
  assert.equal(parseCover("study"), null);
  // M49: a built picture, checked like in a room; unknown parts are kept (whoever draws them falls back)
  const compose = { wall: { part: "tiles", color: "white" }, floor: { part: "future", color: "cream" }, ceiling: { part: "plain", color: "cream" }, items: [] };
  assert.deepEqual(parseCover({ compose }), { compose });
  assert.equal(parseCover({ compose: { ...compose, items: "none" } }), null);
  assert.equal(parseCover({ compose, key: "b".repeat(64) }), null);
});

test("the gallery query selects only what a card needs, never the document", () => {
  const q = roomGalleryQuery({ sort: "plays", lang: "en", q: "keller tür" }, { value: 5, id: id(1) }, 21);
  assert.doesNotMatch(q.select!, /\bdoc\b/);
  assert.match(q.select!, /cover/);
  assert.equal(q.order, "play_count.desc,id.desc");
  assert.equal(q.hidden, "is.false");
  assert.equal(q.lang, "eq.en");
  assert.equal(q.and, '(search_text.ilike."*keller*",search_text.ilike."*tür*")');
  assert.equal(q.or, `(play_count.lt."5",and(play_count.eq."5",id.lt.${id(1)}))`);
  assert.equal(roomGalleryQuery({ sort: "likes", lang: null, q: null }, null, 5).order, "published_at.desc,id.desc");
});

test("a page of rooms with the cursor for the next one", async () => {
  const calls: Call[] = [];
  const api = fakeApi([{ status: 200, body: [row(1), row(2), row(3)] }], calls);
  const page = await fetchRoomPage(api, { sort: "new", lang: null, q: null }, null, 2);
  assert.deepEqual(page.items.map((i) => [i.title, i.author, i.cover]), [
    ["Raum 1", "lisa", { builtin: "study" }],
    ["Raum 2", "lisa", { key: "a".repeat(64) }],
  ]);
  assert.deepEqual(page.next, { value: "2026-11-22T00:00:00Z", id: id(2) });
  assert.match(calls[0]!.url, /\/rest\/v1\/rooms\?/);
});

test("a published room with its document; null if unknown", async () => {
  const calls: Call[] = [];
  const api = fakeApi([
    { status: 200, body: [{ ...row(1), author_id: id(9), doc: { kind: "escape-room" }, description: "Kurz", hidden: false }] },
    { status: 200, body: [] },
  ], calls);
  const room = await fetchPublishedRoom(api, id(1));
  assert.equal(room?.title, "Raum 1");
  assert.equal(room?.authorId, id(9));
  assert.deepEqual(room?.doc, { kind: "escape-room" });
  assert.equal(await fetchPublishedRoom(api, id(2)), null);
});

test("plays, reports and withdrawing go to their own endpoints", async () => {
  const calls: Call[] = [];
  const api = fakeApi([{ status: 204 }, { status: 201 }, { status: 204 }], calls);
  await registerRoomPlay(api, id(1));
  await reportRoom(api, id(9), id(1), "spam", "  zu leicht ");
  await withdrawRoom(api, id(1));
  assert.match(calls[0]!.url, /\/rpc\/register_room_play$/);
  assert.deepEqual(JSON.parse(String(calls[0]!.init.body)), { room: id(1) });
  assert.deepEqual(JSON.parse(String(calls[1]!.init.body)), { room_id: id(1), reporter_id: id(9), reason: "spam", comment: "zu leicht" });
  assert.equal(calls[2]!.init.method, "DELETE");
  assert.match(calls[2]!.url, /\/rooms\?id=eq\./);
});

test("publish errors become texts; errors about an embedded puzzle name it", () => {
  const named = new ApiError("invalid", 400, "puzzle-2", "not-verified");
  assert.equal(roomPublishErrorText(named), "roomPublishPuzzleNotVerified");
  assert.equal(roomPublishErrorPuzzle(named), "puzzle-2");
  const room = new ApiError("invalid", 400, "not-verified", "not-verified");
  assert.equal(roomPublishErrorText(room), "roomPublishNotVerified");
  assert.equal(roomPublishErrorPuzzle(room), null);
  assert.equal(roomPublishErrorText(new ApiError("invalid", 400, "unwinnable", "unwinnable")), "roomPublishUnwinnable");
  assert.equal(roomPublishErrorText(new ApiError("conflict", 409, "duplicate", "duplicate")), "roomPublishDuplicate");
  assert.equal(roomPublishErrorPuzzle(new ApiError("invalid", 400, "x", "invalid-image")), null);
});
