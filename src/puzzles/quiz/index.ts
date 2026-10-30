import type { PuzzleType } from "../../core/types.ts";
import { problems, renderEditor } from "./editor.ts";
import { applyMove, createDefault, initState, isSolved, parseDraft, validate } from "./logic.ts";
import type { QuizData, QuizMove, QuizState } from "./logic.ts";
import { renderPlay } from "./render.ts";

export const quiz: PuzzleType<QuizData, QuizState, QuizMove> = {
  id: "quiz",
  version: 1,
  name: "quizName",
  description: "quizDescription",
  icon: "❓",
  // Taking back an answer after seeing the feedback would make the quiz pointless.
  controls: { undo: false, moves: false },
  createDefault,
  validate,
  parseDraft,
  problems,
  initState,
  applyMove,
  isSolved,
  renderPlay,
  renderEditor,
};
