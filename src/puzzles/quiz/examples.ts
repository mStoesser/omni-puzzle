import type { PuzzleDocument, PuzzleLang } from "../../core/types.ts";
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

/** Quiz examples are written in one language each (M28); the home page lists those in the app's language. */
function example(id: string, lang: PuzzleLang, title: string, data: QuizData) {
  const doc: PuzzleDocument<QuizData> = {
    format: 1,
    type: "quiz",
    typeVersion: 1,
    meta: { title, createdAt: "2026-10-30T00:00:00.000Z", verified: true, lang },
    data,
  };
  return { id, doc, lang };
}

export const quizExamples = [
  example("quiz-1", "de", "Kleines Allgemeinwissen", {
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
  example("quiz-en-1", "en", "A Little General Knowledge", {
    passPercent: 60,
    questions: [
      single("planet", "Which planet is closest to the sun?", ["Venus", "Mercury", "Mars", "Earth"], 1),
      multi("mammals", "Which of these animals are mammals?", ["Dolphin", "Shark", "Bat", "Penguin"], [0, 2]),
      free("capital", "What is the capital of Austria?", ["Vienna", "Wien"]),
      number("spider", "How many legs does a spider have?", 8),
      single("chess", "How many squares are there on a chessboard?", ["32", "64", "81", "100"], 1),
      number("wall", "In which year did the Berlin Wall fall?", 1989),
      free("element", "Which chemical element has the symbol O?", ["Oxygen", "Sauerstoff", "Oxygenium"]),
    ],
  }),
];
