import { test } from "node:test";
import assert from "node:assert/strict";
import { imageKey, toBase64 } from "../core/images.ts";
import { PublishError } from "../core/publish.ts";
import { fakeWebp } from "../core/test-fixtures.ts";
import { rulesRegistry } from "../puzzles/rules.ts";
import { escapeRoomExamples } from "./examples.ts";
import { loadEscapeRoom } from "./logic.ts";
import type { EscapeRoomDocument } from "./logic.ts";
import { ROOM_PUBLISH, isRoomRequest, prepareRoomImages, prepareRoomPublication } from "./publish.ts";
import { ROOM_PER_DAY } from "./published.ts";
import { roomSaveKey } from "./save.ts";

const room = (): EscapeRoomDocument => structuredClone(escapeRoomExamples[0]!.doc) as EscapeRoomDocument;
const rejects = (input: unknown, code: string, message?: string) =>
  assert.throws(
    () => prepareRoomPublication(input, rulesRegistry),
    (e) => e instanceof PublishError && e.code === code && (message === undefined || e.message === message),
  );

test("escape room requests are told apart from puzzle requests by the document's kind", () => {
  assert.equal(isRoomRequest({ doc: room(), title: "x" }), true);
  assert.equal(isRoomRequest({ doc: { format: 1, type: "rushhour" }, title: "x" }), false);
  assert.equal(isRoomRequest(null), false);
});

test("a verified, winnable room is published with its counts, cover and fewest steps", () => {
  const doc = room();
  const mutable = doc as { meta: { author?: string; description?: string } };
  mutable.meta.author = "wird nicht übernommen";
  mutable.meta.description = "auch nicht";
  const pub = prepareRoomPublication({ doc, title: "  Das Arbeitszimmer ", description: " Kurz " }, rulesRegistry);
  assert.equal(pub.title, "Das Arbeitszimmer");
  assert.equal(pub.description, "Kurz");
  assert.equal(pub.lang, "de");
  assert.deepEqual(pub.doc.meta, { title: "Das Arbeitszimmer", createdAt: doc.meta.createdAt, lang: "de", verified: true });
  assert.deepEqual(pub.cover, { builtin: "study" });
  assert.equal(pub.sceneCount, 2);
  assert.equal(pub.puzzleCount, 2);
  assert.ok(pub.minSteps !== null && pub.minSteps > 0);
  // Same key as the saved game on this device (the player keys the loaded room): progress carries over.
  assert.equal(`room:${pub.contentKey}`, roomSaveKey(loadEscapeRoom(doc, rulesRegistry)));
  assert.equal(roomSaveKey(loadEscapeRoom(pub.doc, rulesRegistry)), roomSaveKey(pub.doc));
  assert.match(pub.contentKey, /^[0-9a-f]{64}$/);
});

test("rejects unverified rooms and embedded puzzles, naming the puzzle", () => {
  const unverified = room();
  (unverified.meta as { verified?: boolean }).verified = false;
  rejects({ doc: unverified, title: "x" }, "not-verified");

  const puzzle = room();
  const first = puzzle.data.puzzles[0]!;
  (first.doc.meta as { verified?: boolean }).verified = false;
  rejects({ doc: puzzle, title: "x" }, "not-verified", first.id);
});

test("rejects an embedded puzzle the solver proves unsolvable", () => {
  const doc = room();
  const lights = doc.data.puzzles.find((p) => p.doc.type === "lightsout")!;
  (lights.doc as { data: unknown }).data = { rows: ["*...", "....", "....", "...."] }; // a lone corner light on 4×4
  rejects({ doc, title: "x" }, "unsolvable", lights.id);
});

test("rejects drafts, rooms that cannot be won and malformed requests", () => {
  const draft = room();
  (draft.data.locks[0] as { code: string }).code = "";
  rejects({ doc: draft, title: "x" }, "invalid-document");

  const noWin = room();
  const json = JSON.stringify(noWin.data).replaceAll('{"do":"win"}', '{"do":"view","view":"painting"}');
  (noWin as { data: unknown }).data = JSON.parse(json);
  rejects({ doc: noWin, title: "x" }, "unwinnable");

  rejects(null, "invalid-request");
  rejects({ doc: room() }, "invalid-request");
  rejects({ doc: room(), title: "  " }, "invalid-title");
  rejects({ doc: room(), title: "x", description: "y".repeat(2001) }, "invalid-description");
  rejects({ doc: { ...room(), data: { ...room().data, intro: "x".repeat(600_000) } }, title: "x" }, "too-large");
});

test("own pictures must come with the request and match their keys", () => {
  const doc = room();
  const bytes = fakeWebp(100);
  const key = imageKey(bytes);
  (doc.data.scenes[1] as { image: unknown }).image = { key };
  const pub = prepareRoomPublication({ doc, title: "x" }, rulesRegistry);
  assert.deepEqual(pub.cover, { builtin: "study" }); // the start scene keeps its built-in picture

  const images = prepareRoomImages(pub, { images: { [key]: toBase64(bytes), unused: "AAAA" } }, rulesRegistry);
  assert.deepEqual(images.map((i) => [i.key, i.type]), [[key, "image/webp"]]);
  assert.throws(() => prepareRoomImages(pub, { images: {} }, rulesRegistry), (e) => e instanceof PublishError && e.code === "invalid-image");
  const other = toBase64(fakeWebp(101));
  assert.throws(() => prepareRoomImages(pub, { images: { [key]: other } }, rulesRegistry), (e) => e instanceof PublishError && e.code === "invalid-image");
});

test("the app shows the same daily limit the server enforces", () => {
  assert.equal(ROOM_PER_DAY, ROOM_PUBLISH.perDay);
});
