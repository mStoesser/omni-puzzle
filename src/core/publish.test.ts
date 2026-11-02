import { test } from "node:test";
import assert from "node:assert/strict";
import { examples } from "../puzzles/index.ts";
import { rulesRegistry } from "../puzzles/rules.ts";
import { PublishError, preparePublication } from "./publish.ts";
import { progressKey } from "./storage.ts";
import type { PuzzleDocument } from "./types.ts";

const docOf = (id: string) => structuredClone(examples.find((e) => e.id === id)!.doc) as PuzzleDocument<any>;
const rejects = (input: unknown, code: string) =>
  assert.throws(() => preparePublication(input, rulesRegistry), (e) => e instanceof PublishError && e.code === code);

test("a verified puzzle is published with minMoves computed by the solver", () => {
  const doc = docOf("rushhour-1");
  doc.meta.minMoves = 1; // the client's claim is ignored
  doc.meta.author = "wird nicht übernommen";
  const pub = preparePublication({ doc, title: "  Erste Ausfahrt ", description: " Leicht " }, rulesRegistry);
  assert.equal(pub.title, "Erste Ausfahrt");
  assert.equal(pub.description, "Leicht");
  assert.equal(pub.minMoves, 3);
  assert.deepEqual(pub.doc.meta, { title: "Erste Ausfahrt", createdAt: doc.meta.createdAt, verified: true, minMoves: 3 });
  // Same key as local progress for this puzzle.
  assert.equal(pub.contentKey, progressKey(doc));
});

test("a quiz has no solver; being solved by its creator is enough", () => {
  const doc = docOf(examples.find((e) => e.doc.type === "quiz")!.id);
  const pub = preparePublication({ doc, title: "Quiz" }, rulesRegistry);
  assert.equal(pub.minMoves, null);
  assert.equal(pub.description, "");
});

test("rejects unverified, unsolvable and invalid puzzles", () => {
  const unverified = docOf("rushhour-1");
  delete unverified.meta.verified;
  rejects({ doc: unverified, title: "x" }, "not-verified");

  const blocked = docOf("rushhour-1");
  blocked.data.blocks = [blocked.data.blocks[0], { id: "b1", x: 4, y: 2, length: 2, axis: "h" }];
  rejects({ doc: blocked, title: "x" }, "unsolvable");

  rejects({ doc: { ...docOf("rushhour-1"), type: "unbekannt" }, title: "x" }, "invalid-document");
  rejects({ doc: { format: 1 }, title: "x" }, "invalid-document");
});

test("rejects malformed requests, titles, descriptions and oversized documents", () => {
  const doc = docOf("rushhour-1");
  rejects(null, "invalid-request");
  rejects({ title: "x" }, "invalid-request");
  rejects({ doc, title: 3 }, "invalid-request");
  rejects({ doc, title: "   " }, "invalid-title");
  rejects({ doc, title: "x".repeat(201) }, "invalid-title");
  rejects({ doc, title: "x", description: "x".repeat(2001) }, "invalid-description");
  rejects({ doc: { ...doc, padding: "x".repeat(140_000) }, title: "x" }, "too-large");
});
