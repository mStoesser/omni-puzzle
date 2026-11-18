import { test } from "node:test";
import assert from "node:assert/strict";
import { parseResult } from "./result.ts";

test("empty or blank means no result", () => {
  assert.equal(parseResult(undefined), null);
  assert.equal(parseResult(""), null);
  assert.equal(parseResult("  \n "), null);
});

test("short results without spaces are codes, trimmed", () => {
  assert.deepEqual(parseResult(" 4711 "), { kind: "code", text: "4711" });
  assert.deepEqual(parseResult("ROT-7"), { kind: "code", text: "ROT-7" });
  assert.deepEqual(parseResult("123456789012"), { kind: "code", text: "123456789012" });
  assert.deepEqual(parseResult("🔑🔑🔑"), { kind: "code", text: "🔑🔑🔑" }); // counted as characters, not code units
});

test("longer results or results with spaces are text", () => {
  assert.deepEqual(parseResult("1234567890123"), { kind: "text", text: "1234567890123" });
  assert.deepEqual(parseResult("Schau unter der Matte"), { kind: "text", text: "Schau unter der Matte" });
  assert.deepEqual(parseResult("4 7 1 1"), { kind: "text", text: "4 7 1 1" });
});

test("a whole https address is a link with its domain", () => {
  assert.deepEqual(parseResult("https://example.org/raum/2?x=1"), { kind: "link", url: "https://example.org/raum/2?x=1", domain: "example.org" });
  assert.deepEqual(parseResult(" HTTPS://Example.ORG "), { kind: "link", url: "https://example.org/", domain: "example.org" });
});

test("look-alike letters show as punycode", () => {
  const result = parseResult("https://exаmple.org"); // Cyrillic а
  assert.equal(result?.kind, "link");
  assert.match(result?.kind === "link" ? result.domain : "", /^xn--/);
});

test("other schemes, addresses inside texts and addresses with credentials are no links", () => {
  assert.equal(parseResult("http://example.org")?.kind, "text");
  assert.equal(parseResult("javascript:alert(1)")?.kind, "text");
  assert.equal(parseResult("Weiter auf https://example.org")?.kind, "text");
  assert.equal(parseResult("https://user:pw@example.org")?.kind, "text");
  assert.notEqual(parseResult("https://")?.kind, "link");
  assert.deepEqual(parseResult("example.org"), { kind: "code", text: "example.org" });
});
