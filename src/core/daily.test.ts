import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiError, createApi } from "./api.ts";
import type { Api } from "./api.ts";
import { MAX_LOCAL_DAYS, addLocalDay, dailyStatus, fetchDaily, fetchDailyLeaderboard, fetchDailyPlan, parseLocalDays, planErrorText, streak } from "./daily.ts";
import type { Daily } from "./daily.ts";
import { addDays } from "./day.ts";

function fakeApi(body: unknown, calls: string[] = []): Api {
  const fetch = (async (url: string | URL, init: RequestInit = {}) => {
    calls.push(`${init.method} ${String(url)} ${String(init.body)}`);
    return Response.json(body);
  }) as typeof globalThis.fetch;
  return createApi({ url: "https://abc.supabase.co", key: "k" }, { fetch });
}

const row = {
  day: "2026-11-07",
  puzzle_id: "00000000-0000-4000-8000-000000000001",
  title: "Stau",
  type: "rushhour",
  difficulty: 2,
  content_key: "a".repeat(64),
  solved: false,
  streak: 3,
};

test("fetchDaily posts to daily_puzzle and maps its single row", async () => {
  const calls: string[] = [];
  const daily = await fetchDaily(fakeApi([row], calls));
  assert.equal(calls[0], "POST https://abc.supabase.co/rest/v1/rpc/daily_puzzle {}");
  assert.deepEqual(daily, {
    day: "2026-11-07",
    puzzle: { id: row.puzzle_id, title: "Stau", type: "rushhour", level: 2, contentKey: row.content_key },
    solved: false,
    streak: 3,
  });
});

test("fetchDaily: no puzzle in an empty gallery, no streak when signed out", async () => {
  const empty = { ...row, puzzle_id: null, title: null, type: null, difficulty: null, content_key: null, streak: null };
  assert.deepEqual(await fetchDaily(fakeApi([empty])), { day: "2026-11-07", puzzle: null, solved: false, streak: null });
  assert.equal((await fetchDaily(fakeApi([{ ...row, difficulty: null }]))).puzzle?.level, null);
  await assert.rejects(fetchDaily(fakeApi([])), ApiError);
});

test("fetchDailyLeaderboard asks for the day", async () => {
  const calls: string[] = [];
  const board = await fetchDailyLeaderboard(
    fakeApi([{ place: 1, user_id: "a", username: "alice", moves: 4, time_ms: 900, achieved_at: "t", is_me: true, total: 1 }], calls),
    "2026-11-07",
  );
  assert.match(calls[0]!, /rpc\/daily_leaderboard \{"for_day":"2026-11-07"\}$/);
  assert.equal(board.total, 1);
  assert.equal(board.entries[0]!.isMe, true);
});

test("streak counts back from today, or from yesterday while today is open", () => {
  const today = "2026-11-07";
  const days = (...deltas: number[]) => deltas.map((d) => addDays(today, d));
  assert.equal(streak([], today), 0);
  assert.equal(streak(days(0), today), 1);
  assert.equal(streak(days(-1, -2, -3), today), 3, "today still open");
  assert.equal(streak(days(0, -1, -2, -4), today), 3, "a gap ends it");
  assert.equal(streak(days(-2, -3), today), 0, "yesterday missed");
  assert.equal(streak(days(-40, ...Array.from({ length: 40 }, (_, i) => -i)), today), 41, "unsorted, across months");
});

test("dailyStatus: the server counts when signed in, a queued solution of today is added", () => {
  const daily: Daily = { day: "2026-11-07", puzzle: null, solved: false, streak: 4 };
  assert.deepEqual(dailyStatus(daily, []), { solved: false, streak: 4 });
  assert.deepEqual(dailyStatus(daily, ["2026-11-07"]), { solved: true, streak: 5 });
  assert.deepEqual(dailyStatus({ ...daily, solved: true, streak: 5 }, ["2026-11-07"]), { solved: true, streak: 5 });
  assert.deepEqual(dailyStatus({ ...daily, streak: null }, ["2026-11-05", "2026-11-06"]), { solved: false, streak: 2 }, "signed out");
  assert.deepEqual(dailyStatus({ ...daily, streak: null }, ["2026-11-06", "2026-11-07"]), { solved: true, streak: 2 });
});

test("local days: parsed defensively, kept sorted and limited", () => {
  assert.deepEqual(parseLocalDays(null), []);
  assert.deepEqual(parseLocalDays("{"), []);
  assert.deepEqual(parseLocalDays('{"a":1}'), []);
  assert.deepEqual(parseLocalDays('["2026-11-07", "x", 3, "2026-11-05", "2026-11-07"]'), ["2026-11-05", "2026-11-07"]);
  const days = ["2026-11-05"];
  assert.equal(addLocalDay(days, "2026-11-05"), days, "unchanged");
  assert.deepEqual(addLocalDay(days, "2026-11-04"), ["2026-11-04", "2026-11-05"]);
  let many: readonly string[] = [];
  for (let i = 0; i < MAX_LOCAL_DAYS + 5; i++) many = addLocalDay(many, addDays("2025-01-01", i));
  assert.equal(many.length, MAX_LOCAL_DAYS);
  assert.equal(many[0], addDays("2025-01-01", 5), "the oldest drop out");
});

test("fetchDailyPlan maps planned and automatic days", async () => {
  const plan = await fetchDailyPlan(
    fakeApi([
      { day: "2026-11-07", puzzle_id: row.puzzle_id, title: "Stau", type: "rushhour", hidden: false, planned_by: null },
      { day: "2026-11-08", puzzle_id: null, title: null, type: null, hidden: null, planned_by: null },
      { day: "2026-11-09", puzzle_id: row.puzzle_id, title: "Stau", type: "rushhour", hidden: true, planned_by: "mod" },
    ]),
  );
  assert.deepEqual(plan[0]!.puzzle, { id: row.puzzle_id, title: "Stau", type: "rushhour", hidden: false });
  assert.equal(plan[1]!.puzzle, null);
  assert.equal(plan[2]!.plannedBy, "mod");
  assert.equal(plan[2]!.puzzle?.hidden, true);
});

test("planErrorText tells a wrong day from an unsuitable puzzle", () => {
  assert.equal(planErrorText(new ApiError("invalid", 400, "unsuitable", "PT400")), "dailyPlanUnsuitable");
  assert.equal(planErrorText(new ApiError("invalid", 400, "day", "PT400")), "dailyPlanDay");
  assert.equal(planErrorText(new ApiError("offline", 0)), "apiOffline");
});
