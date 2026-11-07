import { test } from "node:test";
import assert from "node:assert/strict";
import { handleCleanup, imageKeysOf } from "./cleanup-handler.ts";
import { createDefault } from "../puzzles/quiz/logic.ts";

const URL_ = "https://abc.supabase.co";
const KEEP = "11111111-1111-4111-8111-111111111111";
const GONE = "22222222-2222-4222-8222-222222222222";
const USER = "33333333-3333-4333-8333-333333333333";
const OLD_USER = "44444444-4444-4444-8444-444444444444";
const NOW = Date.parse("2026-11-07T12:00:00Z");
const USED = "c".repeat(64);

function quizWith(key: string) {
  const data = createDefault();
  data.questions[0]!.image = { key, alt: "Bild" };
  return { format: 1, type: "quiz", typeVersion: 2, meta: { title: "Q", createdAt: "2026-11-01T00:00:00Z" }, data };
}

type Call = { url: string; init: RequestInit };

function storage(calls: Call[]): typeof fetch {
  return (async (url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    const u = String(url);
    if (u.endsWith("/object/list/quiz-images")) {
      const { prefix } = JSON.parse(String(init.body));
      if (prefix === "") return Response.json([{ name: KEEP }, { name: GONE }, { name: ".emptyFolderPlaceholder" }]);
      return Response.json([{ name: "a".repeat(64) }, { name: "b".repeat(64) }]);
    }
    if (u.endsWith("/object/list/user-images")) {
      const { prefix } = JSON.parse(String(init.body));
      if (prefix === "") return Response.json([{ name: USER }, { name: OLD_USER }]);
      return Response.json([
        { name: USED, created_at: "2026-11-01T00:00:00Z" },
        { name: "d".repeat(64), created_at: "2026-11-01T00:00:00Z" }, // unused, old
        { name: "e".repeat(64), created_at: "2026-11-07T11:00:00Z" }, // unused, uploaded an hour ago
      ]);
    }
    if (u.includes("/rest/v1/puzzles")) return Response.json([{ id: KEEP }]);
    if (u.includes("/rest/v1/profiles")) return Response.json([{ id: USER }]);
    if (u.includes("/rest/v1/sync_puzzles")) return Response.json(new URL(u).searchParams.get("offset") === "0" ? [{ doc: quizWith(USED) }] : []);
    return Response.json([]);
  }) as typeof fetch;
}

const run = (secret: string | null, calls: Call[], envSecret = "geheim") =>
  handleCleanup(
    new Request(`${URL_}/functions/v1/cleanup-images`, { method: "POST", headers: secret === null ? {} : { "x-cleanup-secret": secret } }),
    { url: URL_, serviceKey: "sb_secret_x", secret: envSecret, fetch: storage(calls), now: () => NOW },
  );

test("deletes the folders of puzzles that no longer exist", async () => {
  const calls: Call[] = [];
  const response = await run("geheim", calls);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    folders: 2,
    removedFolders: 1,
    removedFiles: 2,
    userFolders: 2,
    removedUserFolders: 1,
    removedUserFiles: 4,
  });
  assert.match(decodeURIComponent(calls.find((c) => c.url.includes("/rest/"))!.url), new RegExp(`id=in\\.\\(${KEEP},${GONE}\\)`));
  const deletes = calls.filter((c) => c.init.method === "DELETE").map((c) => [c.url.split("/object/")[1], JSON.parse(String(c.init.body)).prefixes]);
  assert.deepEqual(deletes, [
    ["quiz-images", [`${GONE}/${"a".repeat(64)}`, `${GONE}/${"b".repeat(64)}`]],
    ["user-images", [`${USER}/${"d".repeat(64)}`]],
    ["user-images", [USED, "d".repeat(64), "e".repeat(64)].map((k) => `${OLD_USER}/${k}`)],
  ]);
});

test("imageKeysOf reads the pictures of a synced document, null for unreadable ones", () => {
  assert.deepEqual(imageKeysOf(quizWith(USED)), [USED]);
  assert.equal(imageKeysOf({ format: 1, type: "quiz", typeVersion: 99, meta: { title: "", createdAt: "" }, data: {} }), null);
});

test("refuses without the right secret, or when none is configured", async () => {
  const calls: Call[] = [];
  assert.equal((await run(null, calls)).status, 401);
  assert.equal((await run("falsch", calls)).status, 401);
  assert.equal((await run("", calls, "")).status, 401);
  assert.equal(calls.length, 0);
});
