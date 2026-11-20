import { test } from "node:test";
import assert from "node:assert/strict";
import { sha256Hex } from "../core/hash.ts";
import { escapeRoomExamples } from "../rooms/examples.ts";
import { handleRound } from "./round-handler.ts";

const URL_ = "https://abc.supabase.co";
const ROOM = "00000000-0000-4000-8000-000000000001";
const ROUND = "00000000-0000-4000-8000-000000000002";
const TOKEN = "ab".repeat(32);
const doc = escapeRoomExamples[0]!.doc;

type Call = { url: string; body: any };
type Answer = { status: number; body: unknown };

/** Fake Supabase: Auth knows the token "good" (user u1); RPCs answer by name, rooms with the example. */
function backend(rpc: (name: string, body: any) => Answer, calls: Call[] = []): typeof fetch {
  return (async (url: string | URL, init: RequestInit = {}) => {
    const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ url: String(url), body });
    if (String(url).endsWith("/auth/v1/user")) {
      const auth = (init.headers as Record<string, string>).Authorization;
      return auth === "Bearer good" ? Response.json({ id: "u1" }) : Response.json({ msg: "bad jwt" }, { status: 401 });
    }
    if (String(url).includes("/rest/v1/rooms?")) return Response.json([{ doc }]);
    const answer = rpc(String(url).split("/rpc/")[1]!, body);
    return Response.json(answer.body, { status: answer.status });
  }) as typeof fetch;
}

function post(body: unknown, token: string | null = null) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Request(`${URL_}/functions/v1/round`, { method: "POST", headers, body: JSON.stringify(body) });
}

let counter = 0;
const random = (n: number) => new Uint8Array(n).map(() => counter++ % 256);
const env = (doFetch: typeof fetch) => ({ url: URL_, serviceKey: "sb_secret_x", fetch: doFetch, random });

async function call(body: unknown, rpc: (name: string, body: any) => Answer, token: string | null = null, calls: Call[] = []) {
  const response = await handleRound(post(body, token), env(backend(rpc, calls)));
  return { status: response.status, body: await response.json() };
}

test("starting a round needs an account and a name; a taken code is tried again", async () => {
  assert.equal((await call({ action: "create", room: ROOM, name: "Anna" }, () => ({ status: 200, body: ROUND }))).status, 401);
  assert.equal((await call({ action: "create", room: ROOM, name: " " }, () => ({ status: 200, body: ROUND }), "good")).body.error, "invalid-name");
  const calls: Call[] = [];
  let tries = 0;
  const result = await call(
    { action: "create", room: ROOM, name: " Anna " },
    () => (tries++ === 0 ? { status: 409, body: { code: "23505" } } : { status: 200, body: ROUND }),
    "good",
    calls,
  );
  assert.equal(result.status, 200);
  assert.equal(result.body.round, ROUND);
  assert.match(result.body.code, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.match(result.body.token, /^[0-9a-f]{64}$/);
  const creates = calls.filter((c) => c.url.endsWith("/rpc/round_create"));
  assert.equal(creates.length, 2);
  assert.notEqual(creates[0]!.body.round_code, creates[1]!.body.round_code);
  // Only the hash of the token reaches the database.
  assert.equal(creates[1]!.body.token_hash, sha256Hex(result.body.token));
  assert.equal(creates[1]!.body.player_name, "Anna");
  assert.equal(creates[1]!.body.host, "u1");
});

test("the database's refusals become error codes", async () => {
  const refuse = (code: string) => () => ({ status: 400, body: { code } });
  assert.deepEqual((await call({ action: "create", room: ROOM, name: "A" }, refuse("PT429"), "good")).body, { error: "daily-limit" });
  assert.deepEqual((await call({ action: "create", room: ROOM, name: "A" }, refuse("PT404"), "good")).body, { error: "not-found" });
  assert.deepEqual((await call({ action: "join", code: "ABCDEF", name: "B" }, refuse("PT409"))).body, { error: "full" });
  assert.deepEqual((await call({ action: "join", code: "ABCDEF", name: "B" }, refuse("PT410"))).body, { error: "expired" });
  assert.equal((await call({ action: "join", code: "ABCDEF", name: "B" }, refuse("XX000"))).status, 500);
});

test("joining needs a valid code and name, no account", async () => {
  assert.equal((await call({ action: "join", code: "abc", name: "B" }, () => ({ status: 200, body: {} }))).body.error, "invalid-request");
  const calls: Call[] = [];
  const result = await call({ action: "join", code: "ABCDEF", name: "Ben" }, () => ({ status: 200, body: { round: ROUND, room: ROOM } }), null, calls);
  assert.equal(result.status, 200);
  assert.deepEqual([result.body.round, result.body.room], [ROUND, ROOM]);
  assert.equal(calls.at(-1)!.body.token_hash, sha256Hex(result.body.token));
});

test("events are replayed on the round's state; only what holds is merged", async () => {
  const state = { player: "p1", round: ROUND, room: ROOM, flags: [], solved: ["lights"], opened: [], won: false, events: 3, expired: false };
  const calls: Call[] = [];
  const result = await call(
    {
      action: "events",
      token: TOKEN,
      events: [
        { scene: "study", event: { kind: "code", lock: "safe", code: "000" } },
        { scene: "study", event: { kind: "code", lock: "safe", code: "314" } },
      ],
    },
    (name, body) => {
      if (name === "round_of_player") return { status: 200, body: state };
      return { status: 200, body: { flags: body.add_flags, solved: body.add_solved, opened: body.add_opened, won: body.add_won } };
    },
    null,
    calls,
  );
  assert.equal(result.status, 200);
  assert.equal(result.body.refused, 1);
  assert.deepEqual(result.body.shared.opened, ["safe"]);
  const lookup = calls.find((c) => c.url.endsWith("/rpc/round_of_player"))!;
  assert.equal(lookup.body.token_hash, sha256Hex(TOKEN));
  const merge = calls.find((c) => c.url.endsWith("/rpc/round_merge"))!.body;
  assert.deepEqual(merge.add_flags, ["safe-open"]);
  assert.deepEqual(merge.add_news, [{ kind: "opened", target: "safe" }]);
  assert.equal(merge.event_total, 2);
  assert.equal(merge.player, "p1");
});

test("events for unknown players, ended rounds and too many events are refused", async () => {
  const events = [{ scene: "study", event: { kind: "spot", spot: "desk" } }];
  assert.equal((await call({ action: "events", token: TOKEN, events }, () => ({ status: 200, body: null }))).body.error, "not-found");
  const over = { player: "p1", room: ROOM, flags: [], solved: [], opened: [], won: false, expired: true };
  assert.equal((await call({ action: "events", token: TOKEN, events }, () => ({ status: 200, body: over }))).body.error, "expired");
  const open = { ...over, expired: false };
  const full = (name: string) => (name === "round_of_player" ? { status: 200, body: open } : { status: 429, body: { code: "PT429" } });
  assert.equal((await call({ action: "events", token: TOKEN, events }, full)).body.error, "too-many");
  assert.equal((await call({ action: "events", token: "x", events }, () => ({ status: 200, body: open }))).body.error, "invalid-request");
  assert.equal((await call({ action: "events", token: TOKEN, events: [] }, () => ({ status: 200, body: open }))).body.error, "invalid-request");
});

test("other requests are refused", async () => {
  assert.equal((await call({ action: "nope" }, () => ({ status: 200, body: null }))).status, 400);
  const response = await handleRound(new Request(`${URL_}/functions/v1/round`, { method: "OPTIONS" }), env(backend(() => ({ status: 200, body: null }))));
  assert.equal(response.status, 204);
  const big = await handleRound(post({ action: "join", pad: "x".repeat(20_000) }), env(backend(() => ({ status: 200, body: null }))));
  assert.equal(big.status, 413);
});
