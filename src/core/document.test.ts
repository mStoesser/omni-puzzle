import { test } from "node:test";
import assert from "node:assert/strict";
import { DocumentError, loadDocument, validateEnvelope } from "./document.ts";
import { createRegistry } from "./registry.ts";
import { counterDocument, counterType } from "./test-fixtures.ts";

function assertCode(fn: () => unknown, code: string) {
  assert.throws(fn, (error) => error instanceof DocumentError && error.code === code);
}

test("validateEnvelope accepts a valid document and strips unknown fields", () => {
  const raw = { ...counterDocument(3), extra: 1, meta: { ...counterDocument(3).meta, evil: "x", verified: true } };
  const doc = validateEnvelope(raw);
  assert.deepEqual(doc, { ...counterDocument(3), meta: { ...counterDocument(3).meta, verified: true } });
});

test("validateEnvelope rejects malformed envelopes", () => {
  const good = counterDocument(3);
  const bad: unknown[] = [
    null,
    [],
    "doc",
    { ...good, format: "1" },
    { ...good, type: "../etc" },
    { ...good, typeVersion: 1.5 },
    { ...good, typeVersion: 0 },
    { ...good, data: undefined },
    { ...good, meta: null },
    { ...good, meta: { createdAt: good.meta.createdAt } },
    { ...good, meta: { ...good.meta, title: "x".repeat(201) } },
    { ...good, meta: { ...good.meta, verified: "yes" } },
    { ...good, meta: { ...good.meta, minMoves: -1 } },
  ];
  for (const raw of bad) assertCode(() => validateEnvelope(raw), "invalid");
});

test("validateEnvelope reports newer formats as unsupported", () => {
  assertCode(() => validateEnvelope({ ...counterDocument(3), format: 2 }), "unsupported");
});

const registry = createRegistry([counterType]);

test("loadDocument validates data through the puzzle type", () => {
  const { type, doc } = loadDocument(counterDocument(4), registry);
  assert.equal(type, counterType);
  assert.deepEqual(doc.data, { target: 4 });
  assertCode(() => loadDocument({ ...counterDocument(4), data: { target: -1 } }, registry), "invalid");
});

test("loadDocument migrates older type versions", () => {
  const old = { ...counterDocument(0), typeVersion: 1, data: { goal: 5 } };
  const { doc } = loadDocument(old, registry);
  assert.equal(doc.typeVersion, 2);
  assert.deepEqual(doc.data, { target: 5 });
});

test("loadDocument rejects unknown types and newer type versions", () => {
  assertCode(() => loadDocument({ ...counterDocument(1), type: "nope" }, registry), "unknown-type");
  assertCode(() => loadDocument({ ...counterDocument(1), typeVersion: 3 }, registry), "unsupported");
});

test("loadDocument in draft mode uses parseDraft and still rejects malformed data", () => {
  // Drafts may have targets the type would reject for play (here: negative), but must be numbers.
  const draftType = {
    ...counterType,
    id: "draft-counter",
    parseDraft(data: unknown) {
      const target = (data as { target?: unknown } | null)?.target;
      if (!Number.isInteger(target)) throw new Error("bad target");
      return { target: target as number };
    },
  };
  const drafts = createRegistry([draftType]);
  const doc = { ...counterDocument(0), type: "draft-counter", data: { target: -2 } };
  assert.deepEqual(loadDocument(doc, drafts, { draft: true }).doc.data, { target: -2 });
  assertCode(() => loadDocument(doc, drafts), "invalid");
  assertCode(() => loadDocument({ ...doc, data: { target: "x" } }, drafts, { draft: true }), "invalid");
});

test("loadDocument in draft mode falls back to validate", () => {
  assertCode(() => loadDocument({ ...counterDocument(0), data: { target: -1 } }, registry, { draft: true }), "invalid");
});
