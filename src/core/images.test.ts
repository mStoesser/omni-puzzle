import { test } from "node:test";
import assert from "node:assert/strict";
import { IMAGE_LIMITS, fromBase64, imageKey, imageProblem, sniffImageType, toBase64 } from "./images.ts";

const webp = (size: number) => {
  const bytes = new Uint8Array(size).map((_, i) => i & 0xff);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  bytes.set(new TextEncoder().encode("WEBP"), 8);
  return bytes;
};

test("sniffImageType accepts WebP and JPEG only", () => {
  assert.equal(sniffImageType(webp(100)), "image/webp");
  assert.equal(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(sniffImageType(new TextEncoder().encode("<svg onload=alert(1)>")), null);
  assert.equal(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), null); // PNG
});

test("imageProblem checks size, type and key", () => {
  const bytes = webp(1000);
  assert.equal(imageProblem(imageKey(bytes), bytes), null);
  assert.equal(imageProblem("0".repeat(64), bytes), "key");
  assert.equal(imageProblem(imageKey(bytes), new Uint8Array(10)), "type");
  const big = webp(IMAGE_LIMITS.maxBytes + 1);
  assert.equal(imageProblem(imageKey(big), big), "too-large");
});

test("base64 round-trip, also for large arrays", () => {
  const bytes = webp(150_000);
  assert.deepEqual(fromBase64(toBase64(bytes)), bytes);
  assert.equal(toBase64(new Uint8Array([104, 105])), "aGk=");
  assert.throws(() => fromBase64("not base64!"));
});
