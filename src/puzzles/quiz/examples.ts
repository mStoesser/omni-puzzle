import type { PuzzleDocument } from "../../core/types.ts";
import { choiceHash, textHash } from "./logic.ts";
import type { QuizData, QuizQuestion } from "./logic.ts";

// Answers are written in plain text here for readability and hashed like in the editor.

function single(id: string, text: string, options: string[], correct: number): QuizQuestion {
  return { kind: "single", id, text, options, answer: choiceHash(id, [correct]) };
}

function multi(id: string, text: string, options: string[], correct: number[]): QuizQuestion {
  return { kind: "multi", id, text, options, answer: choiceHash(id, correct) };
}

function free(id: string, text: string, answers: string[]): QuizQuestion {
  return { kind: "text", id, text, answers: answers.map((a) => textHash(id, a)) };
}

function number(id: string, text: string, value: number, tolerance = 0): QuizQuestion {
  return { kind: "number", id, text, value, tolerance };
}

function example(id: string, title: string, data: QuizData) {
  const doc: PuzzleDocument<QuizData> = {
    format: 1,
    type: "quiz",
    typeVersion: 1,
    meta: { title, createdAt: "2026-10-30T00:00:00.000Z", verified: true },
    data,
  };
  return { id, doc };
}

export const quizExamples = [
  example("quiz-1", "Kleines Allgemeinwissen", {
    passPercent: 60,
    questions: [
      single("planet", "Welcher Planet ist der Sonne am nächsten?", ["Venus", "Merkur", "Mars", "Erde"], 1),
      multi("mammals", "Welche dieser Tiere sind Säugetiere?", ["Delfin", "Hai", "Fledermaus", "Pinguin"], [0, 2]),
      free("capital", "Wie heißt die Hauptstadt von Österreich?", ["Wien", "Vienna"]),
      number("spider", "Wie viele Beine hat eine Spinne?", 8),
      single("chess", "Aus wie vielen Feldern besteht ein Schachbrett?", ["32", "64", "81", "100"], 1),
      number("wall", "In welchem Jahr fiel die Berliner Mauer?", 1989),
      free("element", "Welches chemische Element hat das Zeichen O?", ["Sauerstoff", "Oxygen", "Oxygenium"]),
    ],
  }),
];
