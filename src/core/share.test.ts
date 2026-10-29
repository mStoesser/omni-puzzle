import { test } from "node:test";
import assert from "node:assert/strict";
import { DocumentError } from "./document.ts";
import { MAX_CODE_LENGTH, decodeDocument, encodeDocument } from "./share.ts";
import { counterDocument } from "./test-fixtures.ts";
import type { PuzzleDocument } from "./types.ts";

async function assertRejects(code: string, errorCode: string) {
  await assert.rejects(decodeDocument(code), (error) => error instanceof DocumentError && error.code === errorCode);
}

test("encode/decode round-trip", async () => {
  const doc = counterDocument(7);
  const code = await encodeDocument(doc);
  assert.match(code, /^1\.[A-Za-z0-9_-]+$/);
  assert.deepEqual(await decodeDocument(code), doc);
});

test("round-trip keeps non-ASCII text", async () => {
  const doc: PuzzleDocument = {
    ...counterDocument(1),
    meta: { title: "Größte Übung 🧩", description: "Ä ö ü ß – „Zitat“", createdAt: "2026-10-29" },
  };
  assert.deepEqual(await decodeDocument(await encodeDocument(doc)), doc);
});

test("codes are compact", async () => {
  const code = await encodeDocument(counterDocument(7));
  assert.ok(code.length < 200, `code length ${code.length}`);
});

test("rejects broken codes", async () => {
  const valid = await encodeDocument(counterDocument(7));
  await assertRejects("", "invalid");
  await assertRejects("abc", "invalid");
  await assertRejects("1.", "invalid");
  await assertRejects("1.!!!!", "invalid");
  await assertRejects("1.A", "invalid");
  await assertRejects("1.AAAAAAAA", "invalid");
  await assertRejects(valid.slice(0, valid.length - 6), "invalid");
});

test("rejects codes from an unknown codec version", async () => {
  const valid = await encodeDocument(counterDocument(7));
  await assertRejects("9" + valid.slice(1), "unsupported");
});

test("rejects valid JSON that is not a puzzle document", async () => {
  const notADoc = { hello: "world" } as unknown as PuzzleDocument;
  await assertRejects(await encodeDocument(notADoc), "invalid");
});

test("rejects too long codes", async () => {
  await assertRejects("1." + "A".repeat(MAX_CODE_LENGTH), "too-large");
});

test("rejects compression bombs", async () => {
  const bomb = { ...counterDocument(1), data: { padding: "a".repeat(1024 * 1024) } };
  const code = await encodeDocument(bomb);
  assert.ok(code.length < MAX_CODE_LENGTH, "bomb code itself is small");
  await assertRejects(code, "too-large");
});
