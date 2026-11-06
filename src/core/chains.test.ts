import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiError, createApi } from "./api.ts";
import {
  CHAIN,
  EMPTY_DRAFT,
  addStep,
  chainErrorText,
  chainGalleryQuery,
  chainProgress,
  draftProblem,
  fetchChain,
  fetchChainPage,
  fetchStepPuzzles,
  isUnlocked,
  moveStep,
  parseSteps,
  publishChain,
  puzzleIdFromLink,
  removeStep,
  setStepText,
} from "./chains.ts";
import type { ChainDraft, ChainStep } from "./chains.ts";

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
const key = (n: number) => String(n % 10).repeat(64);
const step = (n: number, text = ""): ChainStep => ({ puzzle: id(n), key: key(n), text });

test("parseSteps keeps valid steps and drops broken ones", () => {
  assert.deepEqual(parseSteps([step(1, "Hallo"), { puzzle: id(2), key: key(2) }, { puzzle: "x", key: key(3) }, null, { puzzle: id(4) }]), [
    step(1, "Hallo"),
    step(2, ""),
  ]);
  assert.deepEqual(parseSteps({}), []);
});

test("fetchChain maps the row and embeds the author", async () => {
  const calls: Call[] = [];
  const row = {
    id: "c",
    author_id: "u",
    title: "K",
    description: "",
    steps: [step(1), step(2)],
    outro: "Ende",
    play_count: 3,
    published_at: "2026-11-05T10:00:00+00:00",
    hidden: false,
    author: { username: "alice" },
  };
  const chain = await fetchChain(fakeApi([{ status: 200, body: [row] }], calls), "c");
  assert.equal(chain?.author, "alice");
  assert.equal(chain?.steps.length, 2);
  assert.equal(chain?.outro, "Ende");
  assert.match(new URL(calls[0]!.url).searchParams.get("select")!, /chains_author_id_fkey/);
  assert.equal(await fetchChain(fakeApi([{ status: 200, body: [] }], []), "c"), null);
});

test("fetchStepPuzzles asks only for visible puzzles with valid ids", async () => {
  const calls: Call[] = [];
  const map = await fetchStepPuzzles(fakeApi([{ status: 200, body: [{ id: id(1), title: "A", type: "laser" }] }], calls), [id(1), "evil),or=(x", id(2)]);
  const url = new URL(calls[0]!.url);
  assert.equal(url.searchParams.get("id"), `in.(${id(1)},${id(2)})`);
  assert.equal(url.searchParams.get("hidden"), "is.false");
  assert.deepEqual([...map], [[id(1), { title: "A", type: "laser" }]]);
  assert.equal((await fetchStepPuzzles(fakeApi([], []), [])).size, 0);
});

test("chainProgress: solving unlocks the next step, unavailable steps are skipped", () => {
  const steps = [step(1), step(2), step(3), step(4), step(5)];
  const gone = new Set([id(2)]);
  const solved = new Set([key(1), key(5)]);
  const progress = chainProgress(steps, (s) => !gone.has(s.puzzle), (k) => solved.has(k));
  assert.deepEqual(progress.states, ["solved", "unavailable", "open", "locked", "solved"]);
  assert.equal(progress.current, 2);
  assert.equal(progress.solvedCount, 2);
  assert.equal(progress.availableCount, 4);
  assert.ok(isUnlocked(progress, 0));
  assert.ok(isUnlocked(progress, 2));
  assert.ok(!isUnlocked(progress, 1), "unavailable steps cannot be played");
  assert.ok(!isUnlocked(progress, 3));
  assert.ok(!isUnlocked(progress, 4), "solved elsewhere, but not unlocked yet");
  assert.ok(!isUnlocked(progress, 9));

  const done = chainProgress(steps, (s) => !gone.has(s.puzzle), () => true);
  assert.equal(done.current, null);
  assert.ok(isUnlocked(done, 4), "a complete chain can be replayed");
});

test("chainGalleryQuery: newest or most played, without hidden chains, with keyset cursor", () => {
  const q = chainGalleryQuery("new", null, 21);
  assert.equal(q.order, "published_at.desc,id.desc");
  assert.equal(q.hidden, "is.false");
  assert.match(q.select!, /steps/);
  const plays = chainGalleryQuery("plays", { value: 4, id: "x" }, 21);
  assert.equal(plays.or, '(play_count.lt."4",and(play_count.eq."4",id.lt.x))');
  assert.equal(chainGalleryQuery("likes", null, 21).order, "published_at.desc,id.desc");
});

test("fetchChainPage returns the step keys and the next cursor", async () => {
  const row = (n: number) => ({ id: `c${n}`, title: `K${n}`, steps: [step(1), step(2)], play_count: 9 - n, published_at: "t", author: null });
  const page = await fetchChainPage(fakeApi([{ status: 200, body: [row(0), row(1), row(2)] }], []), "plays", null, 2);
  assert.deepEqual(page.items.map((i) => i.id), ["c0", "c1"]);
  assert.deepEqual(page.items[0]!.stepKeys, [key(1), key(2)]);
  assert.equal(page.items[0]!.author, null);
  assert.deepEqual(page.next, { value: 8, id: "c1" });
});

test("puzzleIdFromLink accepts ids, hash routes and full links", () => {
  assert.equal(puzzleIdFromLink(id(7)), id(7));
  assert.equal(puzzleIdFromLink(` https://example.org/knobelkiste/#/g/${id(7).toUpperCase()} `), id(7));
  assert.equal(puzzleIdFromLink(`#/g/${id(7)}`), id(7));
  assert.equal(puzzleIdFromLink(`#/play/${id(7)}`), null);
  assert.equal(puzzleIdFromLink("#/g/kaputt"), null);
  assert.equal(puzzleIdFromLink(""), null);
});

const draftStep = (n: number) => ({ puzzle: id(n), title: `R${n}`, type: "laser", text: "" });

test("editing steps: add without duplicates up to the limit, move, remove, text", () => {
  let draft = addStep(EMPTY_DRAFT, draftStep(1)) as ChainDraft;
  draft = addStep(draft, draftStep(2)) as ChainDraft;
  assert.equal(addStep(draft, draftStep(1)), "duplicate");
  assert.deepEqual(moveStep(draft, 1, -1).steps.map((s) => s.title), ["R2", "R1"]);
  assert.equal(moveStep(draft, 0, -1), draft);
  assert.equal(moveStep(draft, 1, 1), draft);
  assert.deepEqual(removeStep(draft, 0).steps.map((s) => s.title), ["R2"]);
  assert.equal(setStepText(draft, 1, "Weiter").steps[1]!.text, "Weiter");
  assert.equal(draft.steps[1]!.text, "", "not mutated");

  let full = EMPTY_DRAFT;
  for (let i = 0; i < CHAIN.maxSteps; i++) full = addStep(full, draftStep(i)) as ChainDraft;
  assert.equal(addStep(full, draftStep(99)), "full");
});

test("draftProblem checks the same limits as publish_chain", () => {
  const ok: ChainDraft = { title: " Kette ", description: "", outro: "", steps: [draftStep(1), draftStep(2)] };
  assert.equal(draftProblem(ok), null);
  assert.equal(draftProblem({ ...ok, title: "  " }), "chainInvalidTitle");
  assert.equal(draftProblem({ ...ok, steps: [draftStep(1)] }), "chainTooFewSteps");
  assert.equal(draftProblem({ ...ok, outro: "x".repeat(CHAIN.maxOutro + 1) }), "chainInvalidOutro");
  assert.equal(draftProblem(setStepText(ok, 0, "x".repeat(CHAIN.maxText + 1))), "chainInvalidText");
});

test("publishChain sends trimmed texts and only the puzzle ids; errors map to texts", async () => {
  const calls: Call[] = [];
  const draft: ChainDraft = { title: " K ", description: " d ", outro: " Ende ", steps: [{ ...draftStep(1), text: " Los " }, draftStep(2)] };
  assert.equal(await publishChain(fakeApi([{ status: 200, body: "new-id" }], calls), draft), "new-id");
  assert.match(calls[0]!.url, /rpc\/publish_chain$/);
  assert.deepEqual(JSON.parse(String(calls[0]!.init.body)), {
    title: "K",
    description: "d",
    outro: "Ende",
    steps: [{ puzzle: id(1), text: "Los" }, { puzzle: id(2), text: "" }],
  });

  const refused = await publishChain(fakeApi([{ status: 400, body: { code: "PT400", message: "unavailable-puzzle" } }], []), draft).catch((e: unknown) => e);
  assert.ok(refused instanceof ApiError);
  assert.equal(chainErrorText(refused), "chainUnavailablePuzzle");
  assert.equal(chainErrorText(new ApiError("rate-limited", 429, "daily-limit", "PT429")), "chainDailyLimit");
  assert.equal(chainErrorText(new ApiError("offline", 0)), "apiOffline");
});
