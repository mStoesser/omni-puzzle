import type { PuzzleRules } from "../../core/types.ts";
import { applyMove, createDefault, imageKeys, initState, isSolved, migrate, parseDraft, validate } from "./logic.ts";
import type { QuizData, QuizMove, QuizState } from "./logic.ts";

// No solver: the answers are only stored as hashes.
export const quizRules: PuzzleRules<QuizData, QuizState, QuizMove> = {
  id: "quiz",
  version: 2, // 2: optional image per question
  createDefault,
  validate,
  migrate,
  parseDraft,
  initState,
  applyMove,
  isSolved,
  imageKeys,
};
