import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeAnswer, sha256Bytes, sha256Hex } from "./hash.ts";

test("sha256Hex matches known digests", () => {
  assert.equal(sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(
    sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"),
    "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
  );
});

test("sha256Hex agrees with crypto.subtle for many lengths and non-ASCII text", async () => {
  // Lengths around the 55/56/64-byte padding boundaries matter most.
  const inputs = [];
  for (let n = 0; n < 200; n++) inputs.push("x".repeat(n));
  inputs.push("Größe – „Zitat“ 🧩", "ä".repeat(40), "a\nb\tc");
  for (const text of inputs) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    const expected = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
    assert.equal(sha256Hex(text), expected, JSON.stringify(text));
  }
});

test("sha256Bytes agrees with crypto.subtle on binary data", async () => {
  const bytes = new Uint8Array(70_000).map((_, i) => (i * 31 + 7) & 0xff);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  assert.equal(sha256Bytes(bytes), Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join(""));
});

test("normalizeAnswer ignores case and whitespace", () => {
  assert.equal(normalizeAnswer("  Berlin  "), "berlin");
  assert.equal(normalizeAnswer("New\t  YORK\n"), "new york");
  assert.equal(normalizeAnswer("BERLIN"), normalizeAnswer("berlin"));
});

test("normalizeAnswer unifies umlauts, ß and accents", () => {
  assert.equal(normalizeAnswer("Müller"), "mueller");
  assert.equal(normalizeAnswer("Mueller"), "mueller");
  assert.equal(normalizeAnswer("ÄÖÜ"), "aeoeue");
  assert.equal(normalizeAnswer("Straße"), normalizeAnswer("STRASSE"));
  assert.equal(normalizeAnswer("ẞ"), "ss");
  assert.equal(normalizeAnswer("Café Crème"), "cafe creme");
  // Decomposed umlaut (u + combining diaeresis) is the same as the composed one.
  assert.equal(normalizeAnswer("Müller"), "mueller");
});

test("normalizeAnswer keeps meaningful differences", () => {
  assert.notEqual(normalizeAnswer("Rom"), normalizeAnswer("Rum"));
  assert.notEqual(normalizeAnswer("1"), normalizeAnswer("l"));
});
