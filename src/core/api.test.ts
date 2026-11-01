import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiError, apiErrorText, backendConfig, createApi, errorFromResponse } from "./api.ts";
import type { ApiErrorKind } from "./api.ts";

const CONFIG = { url: "https://abc123.supabase.co", key: "sb_publishable_test" };

type Call = { url: string; init: RequestInit };

/** A fake fetch that records calls and answers with the given status and body. */
function fakeFetch(status: number, body: string, calls: Call[] = []): typeof fetch {
  return (async (url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return new Response(status === 204 ? null : body, { status });
  }) as typeof fetch;
}

async function assertKind(promise: Promise<unknown>, kind: ApiErrorKind) {
  await assert.rejects(promise, (error) => error instanceof ApiError && error.kind === kind);
}

test("backendConfig accepts Supabase and local URLs only", () => {
  assert.deepEqual(backendConfig("https://abc123.supabase.co/", " key "), { url: "https://abc123.supabase.co", key: "key" });
  assert.deepEqual(backendConfig("http://localhost:54321", "k"), { url: "http://localhost:54321", key: "k" });
  assert.equal(backendConfig("https://supabase.com/dashboard/project/abc123", "k"), null);
  assert.equal(backendConfig("http://abc123.supabase.co", "k"), null);
  assert.equal(backendConfig("https://abc123.supabase.co", ""), null);
  assert.equal(backendConfig(undefined, undefined), null);
});

test("rest builds the URL and sends the key in apikey only", async () => {
  const calls: Call[] = [];
  const api = createApi(CONFIG, { fetch: fakeFetch(200, "[]", calls) });
  assert.deepEqual(await api.rest("puzzles", { query: { select: "id,title", limit: "5" } }), []);
  assert.equal(calls[0]!.url, "https://abc123.supabase.co/rest/v1/puzzles?select=id%2Ctitle&limit=5");
  assert.equal(calls[0]!.init.method, "GET");
  const headers = calls[0]!.init.headers as Record<string, string>;
  assert.equal(headers.apikey, "sb_publishable_test");
  assert.equal(headers.Authorization, undefined);
});

test("a body is sent as JSON with POST, a token as bearer", async () => {
  const calls: Call[] = [];
  const api = createApi(CONFIG, { fetch: fakeFetch(204, "", calls), accessToken: () => "user-jwt" });
  assert.equal(await api.rest("rpc/register_play", { body: { puzzle: "id-1" } }), undefined);
  const { init } = calls[0]!;
  assert.equal(init.method, "POST");
  assert.equal(init.body, '{"puzzle":"id-1"}');
  const headers = init.headers as Record<string, string>;
  assert.equal(headers["Content-Type"], "application/json");
  assert.equal(headers.Authorization, "Bearer user-jwt");
});

test("auth and functions use their base paths", async () => {
  const calls: Call[] = [];
  const api = createApi(CONFIG, { fetch: fakeFetch(200, "{}", calls) });
  await api.auth("/token", { query: { grant_type: "password" }, body: {} });
  await api.functions("publish", { body: {} });
  assert.equal(calls[0]!.url, "https://abc123.supabase.co/auth/v1/token?grant_type=password");
  assert.equal(calls[1]!.url, "https://abc123.supabase.co/functions/v1/publish");
});

test("error responses map to kinds", async () => {
  const cases: [number, string, ApiErrorKind][] = [
    [400, '{"code":"22P02","message":"invalid input"}', "invalid"],
    [401, '{"code":"PGRST301","message":"JWT expired"}', "unauthorized"],
    [403, '{"code":"42501","message":"permission denied"}', "forbidden"],
    [404, "", "not-found"],
    [409, '{"code":"23505","message":"duplicate key"}', "conflict"],
    [422, '{"code":422,"error_code":"weak_password","msg":"Password too short"}', "invalid"],
    [429, '{"error_code":"over_request_rate_limit"}', "rate-limited"],
    [503, "Service Unavailable", "server"],
  ];
  for (const [status, body, kind] of cases) {
    await assertKind(createApi(CONFIG, { fetch: fakeFetch(status, body) }).rest("x"), kind);
  }
});

test("errorFromResponse keeps code and message", () => {
  const auth = errorFromResponse(422, { code: 422, error_code: "email_exists", msg: "already registered" });
  assert.equal(auth.code, "email_exists");
  assert.equal(auth.message, "already registered");
  const rest = errorFromResponse(400, { code: "23505", message: "duplicate key" });
  assert.equal(rest.kind, "conflict");
  assert.equal(rest.status, 400);
});

test("network failures and timeouts", async () => {
  const offline = (async () => {
    throw new TypeError("Failed to fetch");
  }) as typeof fetch;
  await assertKind(createApi(CONFIG, { fetch: offline }).rest("x"), "offline");

  const hanging = ((_url: string | URL, init: RequestInit = {}) =>
    new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(init.signal!.reason));
    })) as typeof fetch;
  await assertKind(createApi(CONFIG, { fetch: hanging, timeoutMs: 10 }).rest("x"), "timeout");
});

test("every error has a text", () => {
  const kinds: ApiErrorKind[] = [
    "offline", "timeout", "unauthorized", "forbidden", "not-found", "conflict", "rate-limited", "invalid", "server",
  ];
  const texts = new Set(kinds.map((kind) => apiErrorText(new ApiError(kind, 0))));
  assert.equal(texts.size, kinds.length);
  assert.equal(apiErrorText(new Error("boom")), "apiServer");
});
