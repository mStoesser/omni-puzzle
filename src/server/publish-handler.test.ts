import { test } from "node:test";
import assert from "node:assert/strict";
import { examples } from "../puzzles/index.ts";
import { imageKey, toBase64 } from "../core/images.ts";
import { fakeWebp } from "../core/test-fixtures.ts";
import { handlePublish } from "./publish-handler.ts";

const URL_ = "https://abc.supabase.co";
const doc = examples.find((e) => e.id === "rushhour-1")!.doc;

type Call = { url: string; init: RequestInit };

/** Fake Supabase: Auth knows the token "good", the RPC answers with `rpc`. */
function backend(rpc: { status: number; body: unknown }, calls: Call[] = []): typeof fetch {
  return (async (url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/auth/v1/user")) {
      const auth = (init.headers as Record<string, string>).Authorization;
      return auth === "Bearer good" ? Response.json({ id: "u1" }) : Response.json({ msg: "bad jwt" }, { status: 401 });
    }
    return Response.json(rpc.body, { status: rpc.status });
  }) as typeof fetch;
}

function post(body: unknown, token: string | null = "good") {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Request(`${URL_}/functions/v1/publish`, { method: "POST", headers, body: JSON.stringify(body) });
}

async function errorOf(response: Response) {
  return ((await response.json()) as { error: string }).error;
}

test("publishes a checked puzzle via the service-role RPC", async () => {
  const calls: Call[] = [];
  const env = { url: URL_, serviceKey: "sb_secret_x", fetch: backend({ status: 200, body: "p-1" }, calls) };
  const response = await handlePublish(post({ doc, title: "Erste Ausfahrt", description: "" }), env);
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { id: "p-1" });
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");

  const rpc = calls[1]!;
  assert.equal(rpc.url, `${URL_}/rest/v1/rpc/publish_puzzle`);
  assert.deepEqual(rpc.init.headers, { apikey: "sb_secret_x", "Content-Type": "application/json" });
  const args = JSON.parse(String(rpc.init.body));
  assert.equal(args.author, "u1");
  assert.equal(args.min_moves, 3);
  assert.equal(args.difficulty, 1);
  assert.equal(args.lang, null); // the example has no language
  assert.match(args.content_key, /^[0-9a-f]{64}$/);
});

test("a legacy service_role key is also sent as bearer token", async () => {
  const calls: Call[] = [];
  const env = { url: URL_, serviceKey: "eyJlegacy", fetch: backend({ status: 200, body: "p-1" }, calls) };
  await handlePublish(post({ doc, title: "x" }), env);
  assert.equal((calls[1]!.init.headers as Record<string, string>).Authorization, "Bearer eyJlegacy");
});

test("rejects missing or invalid tokens before checking anything", async () => {
  const calls: Call[] = [];
  const env = { url: URL_, serviceKey: "sb_secret_x", fetch: backend({ status: 200, body: "p-1" }, calls) };
  assert.equal((await handlePublish(post({ doc, title: "x" }, null), env)).status, 401);
  const bad = await handlePublish(post({ doc, title: "x" }, "forged"), env);
  assert.equal(bad.status, 401);
  assert.equal(calls.some((c) => c.url.includes("/rpc/")), false);
});

test("maps check failures and database errors to codes", async () => {
  const env = (status: number, body: unknown) => ({ url: URL_, serviceKey: "sb_secret_x", fetch: backend({ status, body }) });
  const ok = env(200, "p-1");

  const unverified = await handlePublish(post({ doc: { ...doc, meta: { title: "x", createdAt: "2026" } }, title: "x" }), ok);
  assert.equal(unverified.status, 400);
  assert.equal(await errorOf(unverified), "not-verified");

  const broken = new Request(`${URL_}/functions/v1/publish`, { method: "POST", headers: { Authorization: "Bearer good" }, body: "{" });
  assert.equal(await errorOf(await handlePublish(broken, ok)), "invalid-request");

  const cases: [number, string, number, string][] = [
    [409, "23505", 409, "duplicate"],
    [403, "PT403", 403, "banned"],
    [429, "PT429", 429, "daily-limit"],
  ];
  for (const [status, code, expectedStatus, expected] of cases) {
    const response = await handlePublish(post({ doc, title: "x" }), env(status, { code, message: "…" }));
    assert.equal(response.status, expectedStatus, code);
    assert.equal(await errorOf(response), expected);
  }

  const error = console.error;
  console.error = () => {};
  try {
    const failed = await handlePublish(post({ doc, title: "x" }), env(500, { code: "XX000" }));
    assert.equal(failed.status, 500);
    assert.equal(failed.headers.get("Access-Control-Allow-Origin"), "*");
  } finally {
    console.error = error;
  }
});

test("answers CORS preflight and refuses other methods", async () => {
  const env = { url: URL_, serviceKey: "sb_secret_x", fetch: backend({ status: 200, body: "" }) };
  const preflight = await handlePublish(new Request(`${URL_}/functions/v1/publish`, { method: "OPTIONS" }), env);
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get("Access-Control-Allow-Headers")!, /authorization/);
  assert.equal((await handlePublish(new Request(`${URL_}/functions/v1/publish`), env)).status, 405);
});

test("uploads the images of a quiz after inserting it; a failed upload takes the puzzle back", async () => {
  const bytes = fakeWebp(7);
  const quiz = structuredClone(examples.find((e) => e.doc.type === "quiz")!.doc) as any;
  quiz.data.questions[0].image = { key: imageKey(bytes), alt: "Bild" };
  const body = { doc: quiz, title: "Quiz", images: { [imageKey(bytes)]: toBase64(bytes) } };

  for (const uploadStatus of [200, 500]) {
    const calls: Call[] = [];
    const fetch = (async (url: string | URL, init: RequestInit = {}) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith("/auth/v1/user")) return Response.json({ id: "u1" });
      if (String(url).includes("/storage/")) return new Response("{}", { status: uploadStatus });
      return Response.json(String(url).includes("/rpc/") ? "p-9" : null);
    }) as typeof globalThis.fetch;
    const error = console.error;
    console.error = () => {};
    const response = await handlePublish(post(body), { url: URL_, serviceKey: "sb_secret_x", fetch });
    console.error = error;

    const upload = calls.find((c) => c.url.includes("/storage/"))!;
    assert.equal(upload.url, `${URL_}/storage/v1/object/quiz-images/p-9/${imageKey(bytes)}`);
    assert.equal((upload.init.headers as Record<string, string>)["Content-Type"], "image/webp");
    if (uploadStatus === 200) {
      assert.equal(response.status, 201);
    } else {
      assert.equal(response.status, 502);
      assert.equal(await errorOf(response), "upload");
      assert.equal(calls.at(-1)!.init.method, "DELETE");
      assert.equal(calls.at(-1)!.url, `${URL_}/rest/v1/puzzles?id=eq.p-9`);
    }
  }
});

test("rejects a quiz whose image is missing from the request", async () => {
  const quiz = structuredClone(examples.find((e) => e.doc.type === "quiz")!.doc) as any;
  quiz.data.questions[0].image = { key: "c".repeat(64), alt: "Bild" };
  const response = await handlePublish(post({ doc: quiz, title: "Quiz" }), { url: URL_, serviceKey: "sb_secret_x", fetch: backend({ status: 200, body: "p" }) });
  assert.equal(response.status, 400);
  assert.equal(await errorOf(response), "invalid-image");
});
