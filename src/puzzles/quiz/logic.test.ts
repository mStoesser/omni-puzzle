import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyMove,
  choiceHash,
  correctChoices,
  createDefault,
  findProblems,
  initState,
  isCorrect,
  isSolved,
  newQuestionId,
  parseDraft,
  passed,
  score,
  textHash,
  validate,
} from "./logic.ts";
import type { QuizAnswer, QuizData, QuizMove, QuizQuestion, QuizState } from "./logic.ts";

const single: QuizQuestion = {
  kind: "single",
  id: "q1",
  text: "Hauptstadt von Frankreich?",
  options: ["Lyon", "Paris", "Nizza"],
  answer: choiceHash("q1", [1]),
};
const multi: QuizQuestion = {
  kind: "multi",
  id: "q2",
  text: "Welche sind Primzahlen?",
  options: ["2", "4", "5", "9"],
  answer: choiceHash("q2", [0, 2]),
};
const text: QuizQuestion = {
  kind: "text",
  id: "q3",
  text: "Wer schrieb den Faust?",
  answers: [textHash("q3", "Goethe"), textHash("q3", "Johann Wolfgang von Goethe")],
};
const number: QuizQuestion = { kind: "number", id: "q4", text: "Wie viel ist 22/7?", value: 3.14, tolerance: 0.01 };

const quiz: QuizData = { questions: [single, multi, text, number], passPercent: 75 };

function play(data: QuizData, answers: QuizAnswer[]): QuizState {
  const moves: QuizMove[] = answers.flatMap((answer) => [{ type: "answer", answer }, { type: "next" }]);
  return moves.reduce((state, move) => {
    const next = applyMove(data, state, move);
    assert.ok(next, `move ${JSON.stringify(move)} rejected`);
    return next;
  }, initState(data));
}

// --- Hashes ---

test("hashes are 128-bit hex, salted with the question id", () => {
  assert.match(choiceHash("a", [0]), /^[0-9a-f]{32}$/);
  assert.notEqual(choiceHash("a", [0]), choiceHash("b", [0]));
  assert.notEqual(textHash("a", "x"), textHash("b", "x"));
  assert.notEqual(choiceHash("a", [0]), textHash("a", "0"), "choice and text answers do not collide");
});

test("choice hashes ignore order and duplicates", () => {
  assert.equal(choiceHash("q", [2, 0]), choiceHash("q", [0, 2, 2]));
  assert.notEqual(choiceHash("q", [0]), choiceHash("q", [0, 2]));
});

test("text hashes use the normalized answer", () => {
  assert.equal(textHash("q", "  GÖTHE "), textHash("q", "goethe"));
  assert.equal(textHash("q", "Straße"), textHash("q", "strasse"));
});

test("correctChoices recovers the marked options", () => {
  assert.deepEqual(correctChoices(single), [1]);
  assert.deepEqual(correctChoices(multi), [0, 2]);
  assert.equal(correctChoices({ ...single, answer: "" }), null);
  assert.equal(correctChoices({ ...single, answer: choiceHash("other", [1]) }), null);
});

test("new question ids are random and valid", () => {
  const id = newQuestionId();
  assert.match(id, /^[a-z0-9]{1,16}$/);
  assert.notEqual(id, newQuestionId());
});

// --- Evaluation of all four kinds ---

test("single choice", () => {
  assert.ok(isCorrect(single, { kind: "single", choice: 1 }));
  assert.ok(!isCorrect(single, { kind: "single", choice: 0 }));
});

test("multiple choice needs exactly the correct set", () => {
  assert.ok(isCorrect(multi, { kind: "multi", choices: [2, 0] }));
  assert.ok(!isCorrect(multi, { kind: "multi", choices: [0] }));
  assert.ok(!isCorrect(multi, { kind: "multi", choices: [0, 2, 3] }));
});

test("free text accepts any listed answer, normalized", () => {
  assert.ok(isCorrect(text, { kind: "text", text: "goethe" }));
  assert.ok(isCorrect(text, { kind: "text", text: "  Johann   Wolfgang von GOETHE " }));
  assert.ok(!isCorrect(text, { kind: "text", text: "Schiller" }));
});

test("numbers count within the tolerance", () => {
  assert.ok(isCorrect(number, { kind: "number", value: 3.14 }));
  assert.ok(isCorrect(number, { kind: "number", value: 3.149 }));
  assert.ok(!isCorrect(number, { kind: "number", value: 3.2 }));
  assert.ok(isCorrect({ ...number, tolerance: 0, value: 7 }, { kind: "number", value: 7 }));
});

test("an answer of the wrong kind is never correct", () => {
  assert.ok(!isCorrect(single, { kind: "text", text: "Paris" }));
});

// --- Playing ---

test("a quiz is played question by question: answer, then next", () => {
  let state = initState(quiz);
  assert.equal(applyMove(quiz, state, { type: "next" }), null, "no next before answering");
  state = applyMove(quiz, state, { type: "answer", answer: { kind: "single", choice: 1 } })!;
  assert.equal(state.index, 0);
  assert.equal(applyMove(quiz, state, { type: "answer", answer: { kind: "single", choice: 0 } }), null, "no second answer");
  state = applyMove(quiz, state, { type: "next" })!;
  assert.equal(state.index, 1);
  assert.equal(
    applyMove(quiz, state, { type: "answer", answer: { kind: "single", choice: 0 } }),
    null,
    "answer must fit the question kind",
  );
  assert.equal(applyMove(quiz, state, { type: "answer", answer: { kind: "multi", choices: [] } }), null);
  assert.equal(applyMove(quiz, state, { type: "answer", answer: { kind: "multi", choices: [7] } }), null);
});

test("finishing with enough correct answers solves the quiz", () => {
  const good = play(quiz, [
    { kind: "single", choice: 1 },
    { kind: "multi", choices: [0, 2] },
    { kind: "text", text: "Goethe" },
    { kind: "number", value: 99 },
  ]);
  assert.equal(good.finished, true);
  assert.equal(score(quiz, good), 3);
  assert.ok(passed(quiz, good), "3 of 4 = 75 % reaches 75 %");
  assert.ok(isSolved(quiz, good));
  assert.equal(applyMove(quiz, good, { type: "next" }), null, "no moves after the end");

  const bad = play(quiz, [
    { kind: "single", choice: 1 },
    { kind: "multi", choices: [0] },
    { kind: "text", text: "Goethe" },
    { kind: "number", value: 99 },
  ]);
  assert.equal(score(quiz, bad), 2);
  assert.ok(!isSolved(quiz, bad));
});

test("not finished is not solved, even with all answers correct so far", () => {
  const state = applyMove(quiz, initState(quiz), { type: "answer", answer: { kind: "single", choice: 1 } })!;
  assert.ok(!isSolved({ ...quiz, questions: [single] }, state));
});

test("state is not mutated", () => {
  const state = initState(quiz);
  applyMove(quiz, state, { type: "answer", answer: { kind: "single", choice: 1 } });
  assert.deepEqual(state, initState(quiz));
});

// --- Validation ---

const codes = (data: QuizData) => findProblems(data).map((p) => p.code);

test("detects unfinished questions", () => {
  assert.deepEqual(codes({ ...quiz, questions: [] }), ["no-questions"]);
  assert.deepEqual(codes(createDefault()), ["empty-question", "empty-option", "no-correct-option"]);
  assert.deepEqual(codes({ ...quiz, questions: [{ ...single, options: ["Paris"], answer: choiceHash("q1", [0]) }] }), [
    "too-few-options",
  ]);
  assert.deepEqual(codes({ ...quiz, questions: [{ ...text, answers: [] }] }), ["no-text-answer"]);
  assert.deepEqual(codes({ ...quiz, questions: [single, { ...multi, id: "q1", answer: choiceHash("q1", [0]) }] }), [
    "duplicate-id",
  ]);
  assert.deepEqual(findProblems({ ...quiz, questions: [single, { ...number, text: " " }] }), [
    { code: "empty-question", question: 1 },
  ]);
});

test("validate accepts a complete quiz and strips unknown fields", () => {
  assert.deepEqual(validate(quiz), quiz);
  const dirty = { ...quiz, extra: 1, questions: quiz.questions.map((q) => ({ ...q, solution: "Paris" })) };
  assert.deepEqual(validate(dirty), quiz);
});

test("validate rejects malformed data", () => {
  for (const raw of [
    null,
    { ...quiz, passPercent: 0 },
    { ...quiz, passPercent: 101 },
    { ...quiz, passPercent: 50.5 },
    { ...quiz, questions: "x" },
    { ...quiz, questions: Array.from({ length: 201 }, () => number) },
    { ...quiz, questions: [{ ...single, kind: "essay" }] },
    { ...quiz, questions: [{ ...single, id: "" }] },
    { ...quiz, questions: [{ ...single, id: "a b" }] },
    { ...quiz, questions: [{ ...single, text: "x".repeat(501) }] },
    { ...quiz, questions: [{ ...single, options: Array(9).fill("x") }] },
    { ...quiz, questions: [{ ...single, answer: "Paris" }] },
    { ...quiz, questions: [{ ...text, answers: ["goethe"] }] },
    { ...quiz, questions: [{ ...number, value: Number.NaN }] },
    { ...quiz, questions: [{ ...number, value: "3" }] },
    { ...quiz, questions: [{ ...number, tolerance: -1 }] },
    { ...quiz, questions: [{ ...single, answer: "" }] }, // structurally fine, but no correct option
  ]) {
    assert.throws(() => validate(raw), Error, JSON.stringify(raw).slice(0, 80));
  }
});

test("parseDraft accepts unfinished quizzes", () => {
  const draft = createDefault();
  assert.deepEqual(parseDraft(draft), draft);
  assert.throws(() => validate(draft), Error);
});
