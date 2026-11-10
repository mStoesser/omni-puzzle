import { test } from "node:test";
import assert from "node:assert/strict";
import { createApi } from "./api.ts";
import { fetchCardPreview, parsePreviewSource, previewData } from "./preview.ts";
import { counterType } from "./test-fixtures.ts";
import type { AnyPuzzleRules } from "./types.ts";

const counter = counterType as unknown as AnyPuzzleRules;

test("parsePreviewSource takes typeVersion and data, nothing else", () => {
  assert.deepEqual(parsePreviewSource({ typeVersion: 2, data: { target: 3 }, extra: 1 }), { typeVersion: 2, data: { target: 3 } });
  for (const value of [null, undefined, "x", [], { typeVersion: 2 }]) assert.equal(parsePreviewSource(value), null, JSON.stringify(value));
});

test("previewData returns the checked data, migrated from older versions", () => {
  assert.deepEqual(previewData(counter, { typeVersion: 2, data: { target: 3 } }), { target: 3 });
  assert.deepEqual(previewData(counter, { typeVersion: 1, data: { goal: 4 } }), { target: 4 });
});

test("previewData is null for invalid data, newer versions, a missing type or source", () => {
  assert.equal(previewData(counter, { typeVersion: 2, data: { target: -1 } }), null);
  assert.equal(previewData(counter, { typeVersion: 3, data: { target: 3 } }), null);
  assert.equal(previewData(counter, { typeVersion: "2", data: { target: 3 } }), null);
  assert.equal(previewData(undefined, { typeVersion: 2, data: { target: 3 } }), null);
  assert.equal(previewData(counter, null), null);
});

test("previewData accepts drafts with draft: true, using parseDraft", () => {
  const drafty = { ...counter, parseDraft: (data: unknown) => data };
  const source = { typeVersion: 2, data: { target: -1 } };
  assert.equal(previewData(drafty, source), null);
  assert.deepEqual(previewData(drafty, { ...source }, { draft: true }), { target: -1 });
});

test("previewData validates a source only once per type", () => {
  let calls = 0;
  const counting = { ...counter, validate: (data: unknown) => (calls++, counter.validate(data)) };
  const source = { typeVersion: 2, data: { target: 3 } };
  previewData(counting, source);
  previewData(counting, source);
  assert.equal(calls, 1);
});

test("fetchCardPreview loads theme and preview of a visible puzzle; nothing for invalid ids", async () => {
  const urls: string[] = [];
  const replies: unknown[] = [[{ theme: "x", preview: { typeVersion: 2, data: { target: 1 } } }], []];
  const fetch = (async (url: string) => (urls.push(url), new Response(JSON.stringify(replies.shift())))) as unknown as typeof globalThis.fetch;
  const api = createApi({ url: "https://abc.supabase.co", key: "k" }, { fetch });
  const id = "00000000-0000-4000-8000-000000000001";
  assert.deepEqual(await fetchCardPreview(api, id), { theme: null, source: { typeVersion: 2, data: { target: 1 } } });
  const params = new URL(urls[0]!).searchParams;
  assert.equal(params.get("id"), `eq.${id}`);
  assert.equal(params.get("hidden"), "is.false");
  assert.equal(await fetchCardPreview(api, id), null); // gone or hidden
  assert.equal(await fetchCardPreview(api, "evil),or=(x"), null);
  assert.equal(urls.length, 2);
});
