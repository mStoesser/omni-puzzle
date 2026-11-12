import { test } from "node:test";
import assert from "node:assert/strict";
import { moveFeedback, SOUNDS, VIBRATIONS } from "./feedback.ts";

test("a move, a rejected move, the solving move, and nothing after solving", () => {
  const open = { solved: false };
  assert.equal(moveFeedback(open, { solved: false }), "move");
  assert.equal(moveFeedback(open, open), "invalid");
  assert.equal(moveFeedback(open, { solved: true }), "solved");
  const done = { solved: true };
  assert.equal(moveFeedback(done, done), null);
});

test("sounds stay quiet and short, vibrations brief", () => {
  for (const tones of Object.values(SOUNDS)) {
    assert.ok(tones.length > 0);
    for (const tone of tones) {
      assert.ok(tone.volume > 0 && tone.volume <= 0.15);
      assert.ok(tone.at + tone.duration <= 0.7);
    }
  }
  for (const pattern of Object.values(VIBRATIONS)) assert.ok(pattern.reduce((a, b) => a + b, 0) <= 400);
});
