import { test } from "node:test";
import assert from "node:assert/strict";
import { handleCleanup } from "./cleanup-handler.ts";

const URL_ = "https://abc.supabase.co";
const KEEP = "11111111-1111-4111-8111-111111111111";
const GONE = "22222222-2222-4222-8222-222222222222";

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
    if (u.includes("/rest/v1/puzzles")) return Response.json([{ id: KEEP }]);
    return Response.json([]);
  }) as typeof fetch;
}

const run = (secret: string | null, calls: Call[], envSecret = "geheim") =>
  handleCleanup(
    new Request(`${URL_}/functions/v1/cleanup-images`, { method: "POST", headers: secret === null ? {} : { "x-cleanup-secret": secret } }),
    { url: URL_, serviceKey: "sb_secret_x", secret: envSecret, fetch: storage(calls) },
  );

test("deletes the folders of puzzles that no longer exist", async () => {
  const calls: Call[] = [];
  const response = await run("geheim", calls);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { folders: 2, removedFolders: 1, removedFiles: 2 });
  assert.match(decodeURIComponent(calls.find((c) => c.url.includes("/rest/"))!.url), new RegExp(`id=in\\.\\(${KEEP},${GONE}\\)`));
  const del = calls.find((c) => c.init.method === "DELETE")!;
  assert.equal(del.url, `${URL_}/storage/v1/object/quiz-images`);
  assert.deepEqual(JSON.parse(String(del.init.body)).prefixes, [`${GONE}/${"a".repeat(64)}`, `${GONE}/${"b".repeat(64)}`]);
});

test("refuses without the right secret, or when none is configured", async () => {
  const calls: Call[] = [];
  assert.equal((await run(null, calls)).status, 401);
  assert.equal((await run("falsch", calls)).status, 401);
  assert.equal((await run("", calls, "")).status, 401);
  assert.equal(calls.length, 0);
});
