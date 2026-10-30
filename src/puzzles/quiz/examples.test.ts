import { test } from "node:test";
import assert from "node:assert/strict";
import { quizExamples } from "./examples.ts";
import { applyMove, initState, isSolved, validate } from "./logic.ts";
import type { QuizAnswer, QuizData } from "./logic.ts";

const RIGHT: Record<string, QuizAnswer> = {
  planet: { kind: "single", choice: 1 },
  mammals: { kind: "multi", choices: [0, 2] },
  capital: { kind: "text", text: "wien" },
  spider: { kind: "number", value: 8 },
  chess: { kind: "single", choice: 1 },
  wall: { kind: "number", value: 1989 },
  element: { kind: "text", text: "SAUERSTOFF" },
};

test("the example quiz is valid and solvable with the right answers", () => {
  assert.ok(quizExamples.length >= 1);
  for (const { doc } of quizExamples) {
    const data: QuizData = doc.data;
    assert.deepEqual(validate(data), data);
    let state = initState(data);
    for (const q of data.questions) {
      state = applyMove(data, state, { type: "answer", answer: RIGHT[q.id]! })!;
      state = applyMove(data, state, { type: "next" })!;
    }
    assert.ok(isSolved(data, state));
  }
});

test("examples contain no answers in plain text", () => {
  const json = JSON.stringify(quizExamples).toLowerCase();
  for (const word of ["wien", "vienna", "sauerstoff", "oxygen"]) assert.ok(!json.includes(word), word);
});
