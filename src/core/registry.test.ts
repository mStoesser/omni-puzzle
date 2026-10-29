import { test } from "node:test";
import assert from "node:assert/strict";
import { createRegistry } from "./registry.ts";
import { counterType } from "./test-fixtures.ts";

test("looks up registered types", () => {
  const registry = createRegistry([counterType]);
  assert.equal(registry.get("counter"), counterType);
  assert.equal(registry.get("missing"), undefined);
  assert.deepEqual(registry.all(), [counterType]);
});

test("rejects duplicate ids", () => {
  assert.throws(() => createRegistry([counterType, counterType]), /Duplicate/);
});

test("rejects invalid ids and versions", () => {
  assert.throws(() => createRegistry([{ ...counterType, id: "Bad Id" }]), /id/);
  assert.throws(() => createRegistry([{ ...counterType, version: 0 }]), /version/);
});
