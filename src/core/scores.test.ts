import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiError, createApi } from "./api.ts";
import { SCORE, ScoreError, checkSolution, enqueue, fetchLeaderboard, isRetryable, myEntry, parseQueue, parseScoreRequest, scoreErrorText } from "./scores.ts";
import type { PendingScore } from "./scores.ts";
import { examples } from "../puzzles/index.ts";
import { rulesRegistry } from "../puzzles/rules.ts";

const rushHour = examples.find((e) => e.id === "rushhour-1")!.doc;
const rules = rulesRegistry.get("rushhour")!;
const solution = () => {
  const result = rules.solve!(rushHour.data, { maxNodes: 10_000 });
  assert.equal(result.status, "solved");
  return (result as { moves: unknown[] }).moves;
};
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return error instanceof ScoreError ? error.code : String(error);
  }
  return "ok";
};
const id = "00000000-0000-4000-8000-000000000001";

test("checkSolution replays the moves and counts them itself", () => {
  const moves = solution();
  assert.equal(checkSolution(rules, rushHour.data, moves), moves.length);
  assert.equal(code(() => checkSolution(rules, rushHour.data, moves.slice(0, -1))), "not-solved", "too short");
  assert.equal(code(() => checkSolution(rules, rushHour.data, [...moves, moves[0]])), "invalid-moves", "a move after solving");
  assert.equal(code(() => checkSolution(rules, rushHour.data, [{ block: 0, delta: 99 }, ...moves])), "invalid-moves", "a forged move");
  assert.equal(code(() => checkSolution(rules, rushHour.data, [null])), "invalid-moves", "applyMove throwing counts as invalid");
  assert.equal(code(() => checkSolution(rules, rushHour.data, new Array(SCORE.maxMoves + 1).fill(moves[0]))), "too-many-moves");
});

test("parseScoreRequest checks the id, the moves list and a plausible time", () => {
  assert.deepEqual(parseScoreRequest({ puzzle: id, moves: [1], timeMs: 1200, extra: 1 }), { puzzle: id, moves: [1], timeMs: 1200 });
  assert.equal(code(() => parseScoreRequest({ puzzle: "x", moves: [], timeMs: 1 })), "invalid-request");
  assert.equal(code(() => parseScoreRequest({ puzzle: id, moves: {}, timeMs: 1 })), "invalid-request");
  assert.equal(code(() => parseScoreRequest({ puzzle: id, moves: [], timeMs: 0 })), "invalid-time");
  assert.equal(code(() => parseScoreRequest({ puzzle: id, moves: [], timeMs: 1.5 })), "invalid-time");
  assert.equal(code(() => parseScoreRequest({ puzzle: id, moves: [], timeMs: SCORE.maxTimeMs + 1 })), "invalid-time");
});

test("fetchLeaderboard maps the rows; the own entry may be below the top 10", async () => {
  const calls: string[] = [];
  const fetch = (async (url: string | URL, init: RequestInit = {}) => {
    calls.push(`${String(url)} ${String(init.body)}`);
    return Response.json([
      { place: 1, user_id: "a", username: "alice", moves: 5, time_ms: 9000, achieved_at: "t", is_me: false, total: 14 },
      { place: 14, user_id: "b", username: "bob", moves: 9, time_ms: 1000, achieved_at: "t", is_me: true, total: 14 },
    ]);
  }) as typeof globalThis.fetch;
  const board = await fetchLeaderboard(createApi({ url: "https://abc.supabase.co", key: "k" }, { fetch }), id);
  assert.match(calls[0]!, /rpc\/leaderboard \{"puzzle":"0{8}-/);
  assert.equal(board.total, 14);
  assert.equal(myEntry(board)?.place, 14);
  assert.equal(board.entries[0]!.timeMs, 9000);
});

test("the offline queue keeps valid entries up to its limit", () => {
  const item = (n: number): PendingScore => ({ userId: "u", puzzle: id, moves: [n], timeMs: 1000 + n });
  let queue: PendingScore[] = [];
  for (let n = 0; n < SCORE.queueSize + 2; n++) queue = enqueue(queue, item(n));
  assert.equal(queue.length, SCORE.queueSize);
  assert.deepEqual(queue[0], item(2), "the oldest drop out");
  assert.deepEqual(parseQueue(JSON.stringify([...queue.slice(0, 2), { userId: "u", puzzle: "x" }, null])), queue.slice(0, 2));
  assert.deepEqual(parseQueue("kaputt"), []);
  assert.deepEqual(parseQueue(null), []);
});

test("errors: offline results wait, rejected ones get a text", () => {
  assert.ok(isRetryable(new ApiError("offline", 0)));
  assert.ok(isRetryable(new ApiError("server", 500, "server", "server")));
  assert.ok(!isRetryable(new ApiError("invalid", 400, "not-solved", "not-solved")));
  assert.equal(scoreErrorText(new ApiError("invalid", 400, "not-solved", "not-solved")), "scoreRejected");
  assert.equal(scoreErrorText(new ApiError("forbidden", 403, "own", "own")), "scoreOwn");
  assert.equal(scoreErrorText(new ApiError("offline", 0)), "apiOffline");
});
