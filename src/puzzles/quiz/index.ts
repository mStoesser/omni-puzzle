import { svg } from "lit-html";
import type { PuzzleType } from "../../core/types.ts";
import { problems, renderEditor } from "./editor.ts";
import type { QuizData, QuizMove, QuizState } from "./logic.ts";
import { renderPlay } from "./render.ts";
import { quizRules } from "./rules.ts";

export const quiz: PuzzleType<QuizData, QuizState, QuizMove> = {
  ...quizRules,
  name: "quizName",
  description: "quizDescription",
  icon: svg`<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>`,
  color: { dark: "#B9A2FF", light: "#6D4ED6" },
  // Taking back an answer after seeing the feedback would make the quiz pointless.
  controls: { undo: false, moves: false },
  problems,
  renderPlay,
  renderEditor,
};
