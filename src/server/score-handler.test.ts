import { test } from "node:test";
import assert from "node:assert/strict";
import { examples } from "../puzzles/index.ts";
import { rulesRegistry } from "../puzzles/rules.ts";
import { fromImage } from "../puzzles/nonogram/logic.ts";
import { handleScore } from "./score-handler.ts";

const URL_ = "https://abc.supabase.co";
const PUZZLE = "00000000-0000-4000-8000-000000000001";
const rushHour = examples.find((e) => e.id === "rushhour-1")!.doc;
const solution = (rulesRegistry.get("rushhour")!.solve!(rushHour.data, { maxNodes: 10_000 }) as { moves: unknown[] }).moves;

type Call = { url: string; init: RequestInit };
type Row = { type: string; doc: unknown; author_id: string; hidden: boolean };

/** Fake Supabase: Auth knows the token "good" (user u1), the puzzle lookup returns `rows`, the RPC answers with `rpc`. */
function backend(rows: Row[], rpc: { status: number; body: unknown } = { status: 200, body: true }, calls: Call[] = []): typeof fetch {
  return (async (url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/auth/v1/user")) {
      const auth = (init.headers as Record<string, string>).Authorization;
      return auth === "Bearer good" ? Response.json({ id: "u1" }) : Response.json({ msg: "bad jwt" }, { status: 401 });
    }
    if (String(url).includes("/rest/v1/puzzles?")) return Response.json(rows);
    return Response.json(rpc.body, { status: rpc.status });
  }) as typeof fetch;
}

const row = (change: Partial<Row> = {}): Row => ({ type: "rushhour", doc: rushHour, author_id: "author", hidden: false, ...change });

function post(body: unknown, token: string | null = "good") {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Request(`${URL_}/functions/v1/submit-score`, { method: "POST", headers, body: JSON.stringify(body) });
}

const env = (fetch: typeof globalThis.fetch) => ({ url: URL_, serviceKey: "sb_secret_x", fetch });
const errorOf = async (response: Response) => ((await response.json()) as { error: string }).error;

test("stores a replayed solution with the move count computed on the server", async () => {
  const calls: Call[] = [];
  const response = await handleScore(post({ puzzle: PUZZLE, moves: solution, timeMs: 4200 }), env(backend([row()], undefined, calls)));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { improved: true });
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
  assert.equal(calls[1]!.url, `${URL_}/rest/v1/puzzles?id=eq.${PUZZLE}&select=type,doc,author_id,hidden`);
  const rpc = calls[2]!;
  assert.equal(rpc.url, `${URL_}/rest/v1/rpc/submit_score`);
  assert.deepEqual(JSON.parse(String(rpc.init.body)), { player: "u1", puzzle: PUZZLE, move_count: solution.length, duration_ms: 4200 });
});

test("a type ranked by time stores no move count", async () => {
  const doc = { format: 1, type: "nonogram", typeVersion: 1, meta: { title: "Plus", createdAt: "t" }, data: fromImage([".....", "..#..", ".###.", "..#..", "....."]) };
  const moves = [{ cells: [7], mark: "#" }, { cells: [11, 12, 13], mark: "#" }, { cells: [17], mark: "#" }];
  const calls: Call[] = [];
  const response = await handleScore(post({ puzzle: PUZZLE, moves, timeMs: 9000 }), env(backend([row({ type: "nonogram", doc })], undefined, calls)));
  assert.equal(response.status, 200);
  assert.equal(JSON.parse(String(calls[2]!.init.body)).move_count, null);
});

test("refuses forged, short and unsolved move lists", async () => {
  const cases: [unknown[], string][] = [
    [solution.slice(0, -1), "not-solved"],
    [[{ block: 0, delta: 42 }, ...solution], "invalid-moves"],
    [[...solution, solution[0]], "invalid-moves"],
    [["x"], "invalid-moves"],
  ];
  for (const [moves, error] of cases) {
    const calls: Call[] = [];
    const response = await handleScore(post({ puzzle: PUZZLE, moves, timeMs: 1000 }), env(backend([row()], undefined, calls)));
    assert.equal(response.status, 400);
    assert.equal(await errorOf(response), error);
    assert.ok(!calls.some((c) => c.url.includes("submit_score")), "nothing is stored");
  }
});

test("checks token, request, time, puzzle and author before storing", async () => {
  const ok = { puzzle: PUZZLE, moves: solution, timeMs: 1000 };
  const status = async (request: Request, rows: Row[] = [row()]) => {
    const response = await handleScore(request, env(backend(rows)));
    return `${response.status} ${await errorOf(response)}`;
  };
  assert.equal(await status(post(ok, null)), "401 unauthorized");
  assert.equal(await status(post(ok, "bad")), "401 unauthorized");
  assert.equal(await status(post({ ...ok, timeMs: 0 })), "400 invalid-time");
  assert.equal(await status(post({ ...ok, timeMs: 25 * 3600 * 1000 })), "400 invalid-time");
  assert.equal(await status(post({ ...ok, puzzle: "x" })), "400 invalid-request");
  assert.equal(await status(post(ok), []), "404 not-found");
  assert.equal(await status(post(ok), [row({ hidden: true })]), "404 not-found");
  assert.equal(await status(post(ok), [row({ author_id: "u1" })]), "403 own");
  const quiz = examples.find((e) => e.id === "quiz-1")!.doc;
  assert.equal(await status(post({ ...ok, moves: [] }), [row({ type: "quiz", doc: quiz })]), "400 no-ranking");
  const big = new Request(`${URL_}/functions/v1/submit-score`, { method: "POST", headers: { Authorization: "Bearer good" }, body: "x".repeat(600_000) });
  assert.equal(await status(big), "413 too-large");
});

test("banned users are refused by the database function", async () => {
  const response = await handleScore(
    post({ puzzle: PUZZLE, moves: solution, timeMs: 1000 }),
    env(backend([row()], { status: 403, body: { code: "PT403", message: "banned" } })),
  );
  assert.equal(response.status, 403);
  assert.equal(await errorOf(response), "banned");
});

test("answers CORS preflights and refuses other methods", async () => {
  const preflight = await handleScore(new Request(`${URL_}/functions/v1/submit-score`, { method: "OPTIONS" }), env(backend([])));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("Access-Control-Allow-Methods"), "POST, OPTIONS");
  assert.equal((await handleScore(new Request(URL_, { method: "GET" }), env(backend([])))).status, 405);
});
