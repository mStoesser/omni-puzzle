import type { PuzzleRules } from "../../core/types.ts";
import { applyMove, createDefault, initState, isSolved, parseDraft, validate } from "./logic.ts";
import type { QuizData, QuizMove, QuizState } from "./logic.ts";

// No solver: the answers are only stored as hashes.
export const quizRules: PuzzleRules<QuizData, QuizState, QuizMove> = {
  id: "quiz",
  version: 1,
  createDefault,
  validate,
  parseDraft,
  initState,
  applyMove,
  isSolved,
};
