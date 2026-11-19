import { test } from "node:test";
import assert from "node:assert/strict";
import { rulesRegistry } from "../puzzles/rules.ts";
import { checkEscapeRoom } from "./check.ts";
import { escapeRoomExample, escapeRoomExamples } from "./examples.ts";
import { loadEscapeRoom } from "./logic.ts";

test("every example loads, can be won without problems, and is in its language", () => {
  for (const example of escapeRoomExamples) {
    const doc = loadEscapeRoom(example.doc, rulesRegistry);
    assert.equal(doc.meta.lang, example.lang, example.id);
    const result = checkEscapeRoom(doc.data);
    assert.equal(result.status, "winnable", example.id);
    assert.deepEqual(result.problems, [], example.id);
  }
});

test("the examples in both languages have the same structure", () => {
  const [de, en] = escapeRoomExamples.map((e) => e.doc.data);
  const shape = (data: typeof de) => JSON.stringify(data, (key, value) => (typeof value === "string" && !["id", "do", "puzzle", "lock", "view", "scene", "flag", "builtin", "start", "code", "type"].includes(key) ? "" : value));
  assert.equal(shape(de), shape(en));
  assert.equal(escapeRoomExample("room-study-en")?.lang, "en");
  assert.equal(escapeRoomExample("nope"), undefined);
});
