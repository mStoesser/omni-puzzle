import { normalizeAnswer, sha256Hex } from "../../core/hash.ts";
import { IMAGE_KEY, IMAGE_LIMITS } from "../../core/images.ts";
import type { ImageRef } from "../../core/images.ts";

export type QuestionKind = "single" | "multi" | "text" | "number";

// Answers are not stored in plain text, so a glance at the link does not give them away:
// choice and text answers are hashes, salted with the question id. Numbers stay plain (tolerance check).
// typeVersion 2 added the optional image per question; version 1 data is valid version 2 data.
type QuestionBase = { id: string; text: string; image?: ImageRef };

export type QuizQuestion = QuestionBase &
  (
    | { kind: "single"; options: string[]; answer: string } // answer = choiceHash, "" = not set
    | { kind: "multi"; options: string[]; answer: string }
    | { kind: "text"; answers: string[] } // textHash of each accepted answer
    | { kind: "number"; value: number; tolerance: number }
  );

export type QuizData = { questions: QuizQuestion[]; passPercent: number };

export type QuizAnswer =
  | { kind: "single"; choice: number }
  | { kind: "multi"; choices: number[] }
  | { kind: "text"; text: string }
  | { kind: "number"; value: number };

export type QuizState = {
  index: number; // current question
  answers: readonly (QuizAnswer | null)[];
  finished: boolean;
};

/** Answer the current question (shows feedback), then go to the next one; after the last, the quiz is finished. */
export type QuizMove = { type: "answer"; answer: QuizAnswer } | { type: "next" };

export const LIMITS = {
  maxQuestions: 200,
  maxText: 500,
  maxOption: 200,
  minOptions: 2,
  maxOptions: 8,
  maxAnswers: 10,
  maxNumber: 1e12,
} as const;

export const QUESTION_KINDS: readonly QuestionKind[] = ["single", "multi", "text", "number"];

const HASH = /^[0-9a-f]{32}$/;
const ID = /^[A-Za-z0-9_-]{1,16}$/;

// --- Hashing ---

/** 128 bits of SHA-256 are plenty to keep players from peeking, and keep links short. */
function answerHash(id: string, payload: string): string {
  return sha256Hex(`${id}\n${payload}`).slice(0, 32);
}

/** Hash of a set of option indexes (order and duplicates do not matter). */
export function choiceHash(id: string, choices: readonly number[]): string {
  const sorted = [...new Set(choices)].sort((a, b) => a - b);
  return answerHash(id, `choice:${sorted.join(",")}`);
}

/** Hash of a free-text answer after normalization (case, whitespace, umlauts). */
export function textHash(id: string, text: string): string {
  return answerHash(id, `text:${normalizeAnswer(text)}`);
}

// Finding the correct options means trying sets of options; results are cached per question.
const choiceCache = new Map<string, number[] | null>();

/** The correct option indexes of a choice question, or null if its answer matches none. */
export function correctChoices(question: QuizQuestion & { kind: "single" | "multi" }): number[] | null {
  const { id, answer, options } = question;
  if (answer === "") return null;
  const key = `${question.kind}|${id}|${answer}|${options.length}`;
  const cached = choiceCache.get(key);
  if (cached !== undefined) return cached;

  let found: number[] | null = null;
  if (question.kind === "single") {
    const index = options.findIndex((_, i) => choiceHash(id, [i]) === answer);
    found = index >= 0 ? [index] : null;
  } else {
    for (let mask = 1; mask < 1 << options.length && !found; mask++) {
      const set = options.flatMap((_, i) => (mask & (1 << i) ? [i] : []));
      if (choiceHash(id, set) === answer) found = set;
    }
  }
  if (choiceCache.size > 2000) choiceCache.clear();
  choiceCache.set(key, found);
  return found;
}

// --- Data ---

/** Random id for a new question; it salts the answer hashes. */
export function newQuestionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 10);
}

export function emptyQuestion(kind: QuestionKind, id: string, text = ""): QuizQuestion {
  switch (kind) {
    case "single":
    case "multi":
      return { kind, id, text, options: ["", ""], answer: "" };
    case "text":
      return { kind, id, text, answers: [] };
    case "number":
      return { kind, id, text, value: 0, tolerance: 0 };
  }
}

export function createDefault(): QuizData {
  return { questions: [emptyQuestion("single", newQuestionId())], passPercent: 50 };
}

export type ProblemCode =
  | "no-questions"
  | "duplicate-id"
  | "empty-question"
  | "empty-option"
  | "too-few-options"
  | "no-correct-option"
  | "no-text-answer"
  | "image-no-alt"
  | "too-many-images";

export type Problem = { code: ProblemCode; question?: number };

export function findProblems(data: QuizData): Problem[] {
  const problems: Problem[] = [];
  if (data.questions.length === 0) problems.push({ code: "no-questions" });
  if (imageKeys(data).length > IMAGE_LIMITS.maxPerPuzzle) problems.push({ code: "too-many-images" });
  const ids = new Set<string>();
  data.questions.forEach((q, i) => {
    const add = (code: ProblemCode) => problems.push({ code, question: i });
    if (ids.has(q.id)) add("duplicate-id");
    ids.add(q.id);
    if (q.text.trim() === "") add("empty-question");
    if (q.image && q.image.alt.trim() === "") add("image-no-alt");
    switch (q.kind) {
      case "single":
      case "multi":
        if (q.options.length < LIMITS.minOptions) add("too-few-options");
        if (q.options.some((o) => o.trim() === "")) add("empty-option");
        if (correctChoices(q) === null) add("no-correct-option");
        break;
      case "text":
        if (q.answers.length === 0) add("no-text-answer");
        break;
      case "number":
        break;
    }
  });
  return problems;
}

/** Validates untrusted data and returns a clean copy. Throws on any problem. */
export function validate(raw: unknown): QuizData {
  const data = parseDraft(raw);
  const problems = findProblems(data);
  if (problems.length > 0) throw new Error(`invalid quiz: ${problems.map((p) => p.code).join(", ")}`);
  return data;
}

/** Checks only the structure and returns a clean copy; editor drafts may still have problems. */
export function parseDraft(raw: unknown): QuizData {
  if (!isRecord(raw)) throw new Error("data is not an object");
  if (!Array.isArray(raw.questions) || raw.questions.length > LIMITS.maxQuestions) throw new Error("questions");
  const passPercent = raw.passPercent;
  if (!Number.isInteger(passPercent) || (passPercent as number) < 1 || (passPercent as number) > 100) {
    throw new Error("passPercent");
  }
  return { questions: raw.questions.map(parseQuestion), passPercent: passPercent as number };
}

function parseQuestion(raw: unknown): QuizQuestion {
  const question = parseQuestionBody(raw);
  const image = (raw as Record<string, unknown>).image;
  if (image === undefined) return question;
  if (!isRecord(image) || typeof image.key !== "string" || !IMAGE_KEY.test(image.key)) throw new Error("image");
  return { ...question, image: { key: image.key, alt: string(image.alt, IMAGE_LIMITS.maxAlt, "image alt") } };
}

function parseQuestionBody(raw: unknown): QuizQuestion {
  if (!isRecord(raw)) throw new Error("question is not an object");
  if (typeof raw.id !== "string" || !ID.test(raw.id)) throw new Error("question id");
  const id = raw.id;
  const text = string(raw.text, LIMITS.maxText, "question text");
  switch (raw.kind) {
    case "single":
    case "multi": {
      if (!Array.isArray(raw.options) || raw.options.length > LIMITS.maxOptions) throw new Error("options");
      const options = raw.options.map((o: unknown) => string(o, LIMITS.maxOption, "option"));
      if (typeof raw.answer !== "string" || (raw.answer !== "" && !HASH.test(raw.answer))) throw new Error("answer");
      return { kind: raw.kind, id, text, options, answer: raw.answer };
    }
    case "text": {
      if (!Array.isArray(raw.answers) || raw.answers.length > LIMITS.maxAnswers) throw new Error("answers");
      const answers = raw.answers.map((a: unknown) => {
        if (typeof a !== "string" || !HASH.test(a)) throw new Error("answer hash");
        return a;
      });
      return { kind: "text", id, text, answers };
    }
    case "number":
      return { kind: "number", id, text, value: number(raw.value, "value"), tolerance: tolerance(raw.tolerance) };
    default:
      throw new Error("question kind");
  }
}

/** Version 1 had no images; its data is valid as version 2. */
export function migrate(data: unknown, fromVersion: number): unknown {
  if (fromVersion === 1) return data;
  throw new Error(`no migration from version ${fromVersion}`);
}

/** Distinct keys of all question images. */
export function imageKeys(data: QuizData): string[] {
  return [...new Set(data.questions.flatMap((q) => (q.image ? [q.image.key] : [])))];
}

// --- Play ---

export function initState(data: QuizData): QuizState {
  return { index: 0, answers: data.questions.map(() => null), finished: false };
}

export function isCorrect(question: QuizQuestion, answer: QuizAnswer): boolean {
  switch (question.kind) {
    case "single":
      return answer.kind === "single" && choiceHash(question.id, [answer.choice]) === question.answer;
    case "multi":
      return answer.kind === "multi" && choiceHash(question.id, answer.choices) === question.answer;
    case "text":
      return answer.kind === "text" && question.answers.includes(textHash(question.id, answer.text));
    case "number":
      return answer.kind === "number" && Math.abs(answer.value - question.value) <= question.tolerance;
  }
}

export function applyMove(data: QuizData, state: QuizState, move: QuizMove): QuizState | null {
  if (state.finished) return null;
  const question = data.questions[state.index];
  if (!question) return null;
  const given = state.answers[state.index];

  if (move.type === "next") {
    if (!given) return null;
    const last = state.index === data.questions.length - 1;
    return last ? { ...state, finished: true } : { ...state, index: state.index + 1 };
  }

  if (given || !fitsQuestion(question, move.answer)) return null;
  const answers = state.answers.map((a, i) => (i === state.index ? move.answer : a));
  return { ...state, answers };
}

function fitsQuestion(question: QuizQuestion, answer: QuizAnswer): boolean {
  if (answer.kind !== question.kind) return false;
  switch (answer.kind) {
    case "single":
      return question.kind === "single" && Number.isInteger(answer.choice) && answer.choice >= 0 && answer.choice < question.options.length;
    case "multi":
      return (
        question.kind === "multi" &&
        answer.choices.length > 0 &&
        answer.choices.every((c) => Number.isInteger(c) && c >= 0 && c < question.options.length)
      );
    case "text":
      return answer.text.trim() !== "" && answer.text.length <= LIMITS.maxText;
    case "number":
      return Number.isFinite(answer.value);
  }
}

/** Number of correctly answered questions. */
export function score(data: QuizData, state: QuizState): number {
  return data.questions.filter((q, i) => {
    const answer = state.answers[i];
    return answer ? isCorrect(q, answer) : false;
  }).length;
}

export function passed(data: QuizData, state: QuizState): boolean {
  return data.questions.length > 0 && score(data, state) * 100 >= data.passPercent * data.questions.length;
}

/** Solved = all questions answered and the pass mark reached. */
export function isSolved(data: QuizData, state: QuizState): boolean {
  return state.finished && passed(data, state);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function string(value: unknown, maxLength: number, field: string): string {
  if (typeof value !== "string" || value.length > maxLength) throw new Error(field);
  return value;
}

function number(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > LIMITS.maxNumber) throw new Error(field);
  return value;
}

function tolerance(value: unknown): number {
  const result = number(value, "tolerance");
  if (result < 0) throw new Error("tolerance");
  return result;
}
