import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addOption,
  addQuestion,
  addTextAnswer,
  changeKind,
  moveQuestion,
  removeOption,
  removeQuestion,
  removeTextAnswer,
  setNumber,
  setOption,
  setPassPercent,
  setQuestionText,
  toggleCorrect,
} from "./edit.ts";
import { LIMITS, choiceHash, correctChoices, findProblems, isCorrect, textHash } from "./logic.ts";
import type { QuizData, QuizQuestion } from "./logic.ts";

const choice = (data: QuizData, i = 0) => data.questions[i] as QuizQuestion & { kind: "single" | "multi" };

function choiceQuiz(kind: "single" | "multi", correct: number[]): QuizData {
  return {
    passPercent: 50,
    questions: [{ kind, id: "q", text: "Frage", options: ["A", "B", "C"], answer: choiceHash("q", correct) }],
  };
}

test("questions can be added, moved and removed", () => {
  let data: QuizData = { questions: [], passPercent: 50 };
  data = addQuestion(data, "text", "a");
  data = addQuestion(data, "number", "b");
  assert.deepEqual(data.questions.map((q) => q.id), ["a", "b"]);
  data = moveQuestion(data, 1, -1);
  assert.deepEqual(data.questions.map((q) => q.id), ["b", "a"]);
  assert.equal(moveQuestion(data, 0, -1), data);
  assert.equal(moveQuestion(data, 1, 1), data);
  data = removeQuestion(data, 0);
  assert.deepEqual(data.questions.map((q) => q.id), ["a"]);
  assert.equal(removeQuestion(data, 5), data);
});

test("the number of questions is limited", () => {
  const full: QuizData = {
    passPercent: 50,
    questions: Array.from({ length: LIMITS.maxQuestions }, (_, i) => ({ kind: "number", id: `n${i}`, text: "x", value: 1, tolerance: 0 })),
  };
  assert.equal(addQuestion(full, "text", "z"), full);
});

test("toggleCorrect: single choice picks one option, multiple choice toggles", () => {
  let data = toggleCorrect(choiceQuiz("single", []), 0, 2);
  assert.deepEqual(correctChoices(choice(data)), [2]);
  data = toggleCorrect(data, 0, 0);
  assert.deepEqual(correctChoices(choice(data)), [0]);

  let multi = toggleCorrect(choiceQuiz("multi", [0]), 0, 2);
  assert.deepEqual(correctChoices(choice(multi)), [0, 2]);
  multi = toggleCorrect(toggleCorrect(multi, 0, 0), 0, 2);
  assert.equal(choice(multi).answer, "", "no correct option left");
});

test("editing an option's text keeps the correct mark", () => {
  const data = setOption(choiceQuiz("single", [1]), 0, 1, "Bee");
  assert.deepEqual(choice(data).options, ["A", "Bee", "C"]);
  assert.deepEqual(correctChoices(choice(data)), [1]);
});

test("removing an option shifts the correct marks", () => {
  const multi = removeOption(choiceQuiz("multi", [0, 2]), 0, 1);
  assert.deepEqual(choice(multi).options, ["A", "C"]);
  assert.deepEqual(correctChoices(choice(multi)), [0, 1]);

  const single = removeOption(choiceQuiz("single", [1]), 0, 1);
  assert.equal(choice(single).answer, "", "the correct option itself was removed");
  assert.deepEqual(findProblems(single).map((p) => p.code), ["no-correct-option"]);
});

test("options can be added up to the limit", () => {
  let data = choiceQuiz("multi", [0]);
  for (let i = 0; i < 10; i++) data = addOption(data, 0);
  assert.equal(choice(data).options.length, LIMITS.maxOptions);
  assert.deepEqual(correctChoices(choice(data)), [0]);
});

test("changing between single and multiple choice keeps options and a single correct option", () => {
  const multi = changeKind(choiceQuiz("single", [1]), 0, "multi");
  assert.equal(choice(multi).kind, "multi");
  assert.deepEqual(correctChoices(choice(multi)), [1]);

  const two = changeKind(choiceQuiz("multi", [0, 1]), 0, "single");
  assert.equal(choice(two).answer, "", "two correct options do not fit single choice");
  assert.deepEqual(choice(two).options, ["A", "B", "C"]);
});

test("changing to another kind keeps id and text but resets the answer", () => {
  const data = changeKind(choiceQuiz("single", [1]), 0, "number");
  assert.deepEqual(data.questions[0], { kind: "number", id: "q", text: "Frage", value: 0, tolerance: 0 });
  assert.equal(changeKind(data, 0, "number"), data);
});

test("free-text answers are stored as hashes only", () => {
  let data: QuizData = { passPercent: 50, questions: [{ kind: "text", id: "t", text: "Wer?", answers: [] }] };
  data = addTextAnswer(data, 0, "Goethe");
  data = addTextAnswer(data, 0, " goethe ");
  data = addTextAnswer(data, 0, "   ");
  const q = data.questions[0]!;
  assert.ok(q.kind === "text");
  assert.deepEqual(q.answers, [textHash("t", "Goethe")], "duplicates after normalization and blanks are skipped");
  assert.ok(!JSON.stringify(data).toLowerCase().includes("goethe"));
  assert.ok(isCorrect(q, { kind: "text", text: "GOETHE" }));
  assert.deepEqual(removeTextAnswer(data, 0, 0).questions[0], { ...q, answers: [] });
});

test("number fields reject invalid values", () => {
  let data: QuizData = { passPercent: 50, questions: [{ kind: "number", id: "n", text: "?", value: 0, tolerance: 0 }] };
  data = setNumber(data, 0, "value", 42.5);
  data = setNumber(data, 0, "tolerance", 0.5);
  assert.deepEqual(data.questions[0], { kind: "number", id: "n", text: "?", value: 42.5, tolerance: 0.5 });
  assert.equal(setNumber(data, 0, "tolerance", -1), data);
  assert.equal(setNumber(data, 0, "value", Number.NaN), data);
  assert.equal(setNumber(data, 0, "value", 1e13), data);
});

test("question text and pass mark", () => {
  const data = setQuestionText(choiceQuiz("single", [0]), 0, "Neu");
  assert.equal(data.questions[0]!.text, "Neu");
  assert.equal(setPassPercent(data, 80).passPercent, 80);
  assert.equal(setPassPercent(data, 0).passPercent, 1);
  assert.equal(setPassPercent(data, 250).passPercent, 100);
  assert.equal(setPassPercent(data, 50), data);
  assert.equal(setPassPercent(data, Number.NaN), data);
});
