import { test } from "node:test";
import assert from "node:assert/strict";
import { sha256Hex } from "./hash.ts";

test("sha256Hex matches known digests", async () => {
  assert.equal(await sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(await sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("sha256Hex encodes text as UTF-8", async () => {
  assert.notEqual(await sha256Hex("ä"), await sha256Hex("a"));
  assert.equal((await sha256Hex("Größe")).length, 64);
});
