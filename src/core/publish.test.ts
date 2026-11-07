import { test } from "node:test";
import assert from "node:assert/strict";
import { examples } from "../puzzles/index.ts";
import { rulesRegistry } from "../puzzles/rules.ts";
import { imageKey, toBase64 } from "./images.ts";
import { PublishError, prepareImages, preparePublication } from "./publish.ts";
import { fakeWebp } from "./test-fixtures.ts";
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
  assert.equal(pub.difficulty, 1);
  assert.deepEqual(pub.doc.meta, { title: "Erste Ausfahrt", createdAt: doc.meta.createdAt, verified: true, minMoves: 3 });
  // Same key as local progress for this puzzle.
  assert.equal(pub.contentKey, progressKey(doc));
});

test("the language is kept in the document and goes into its own column; it does not change the content key", () => {
  const doc = docOf("rushhour-1");
  const plain = preparePublication({ doc: structuredClone(doc), title: "T" }, rulesRegistry);
  assert.equal(plain.lang, null);
  doc.meta.lang = "en";
  const pub = preparePublication({ doc, title: "T" }, rulesRegistry);
  assert.equal(pub.lang, "en");
  assert.equal(pub.doc.meta.lang, "en");
  assert.equal(pub.contentKey, plain.contentKey);
});

test("every built-in example passes the server checks with the same minMoves and a difficulty level", () => {
  for (const { id, doc } of examples) {
    const pub = preparePublication({ doc: structuredClone(doc), title: doc.meta.title }, rulesRegistry);
    assert.equal(pub.minMoves, doc.meta.minMoves ?? null, id);
    if (pub.minMoves !== null) assert.ok(pub.difficulty !== null && pub.difficulty >= 1 && pub.difficulty <= 3, id);
  }
});

test("a quiz has no solver; being solved by its creator is enough", () => {
  const doc = docOf(examples.find((e) => e.doc.type === "quiz")!.id);
  const pub = preparePublication({ doc, title: "Quiz" }, rulesRegistry);
  assert.equal(pub.minMoves, null);
  assert.equal(pub.difficulty, null);
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

function quizWithImage(bytes: Uint8Array) {
  const doc = docOf(examples.find((e) => e.doc.type === "quiz")!.id);
  doc.data.questions[0].image = { key: imageKey(bytes), alt: "Ein Leuchtturm" };
  return doc;
}

test("prepareImages returns the checked bytes of every referenced image", () => {
  const bytes = fakeWebp(3);
  const input = { doc: quizWithImage(bytes), title: "Quiz", images: { [imageKey(bytes)]: toBase64(bytes), unused: "eA==" } };
  const pub = preparePublication(input, rulesRegistry);
  assert.equal(pub.doc.typeVersion, 2);
  const images = prepareImages(pub, input, rulesRegistry);
  assert.deepEqual(images, [{ key: imageKey(bytes), type: "image/webp", bytes }]);
  assert.deepEqual(prepareImages(preparePublication({ doc: docOf("rushhour-1"), title: "x" }, rulesRegistry), {}, rulesRegistry), []);
});

test("prepareImages rejects missing, wrong and mismatching images", () => {
  const bytes = fakeWebp(3);
  const doc = quizWithImage(bytes);
  const fails = (images: unknown) => {
    const input = { doc, title: "Quiz", images };
    assert.throws(() => prepareImages(preparePublication(input, rulesRegistry), input, rulesRegistry), (e) => e instanceof PublishError && e.code === "invalid-image");
  };
  fails(undefined);
  fails({ [imageKey(bytes)]: toBase64(fakeWebp(5)) }); // other bytes than the key says
  fails({ [imageKey(bytes)]: "%%%" });
  fails({ [imageKey(bytes)]: toBase64(new TextEncoder().encode("<svg/>")) });
});
