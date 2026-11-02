import type { PuzzleType } from "../../core/types.ts";
import { problems, renderEditor } from "./editor.ts";
import type { QuizData, QuizMove, QuizState } from "./logic.ts";
import { renderPlay } from "./render.ts";
import { quizRules } from "./rules.ts";

export const quiz: PuzzleType<QuizData, QuizState, QuizMove> = {
  ...quizRules,
  name: "quizName",
  description: "quizDescription",
  icon: "❓",
  // Taking back an answer after seeing the feedback would make the quiz pointless.
  controls: { undo: false, moves: false },
  problems,
  renderPlay,
  renderEditor,
};
