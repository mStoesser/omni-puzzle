import { svg } from "lit-html";
import type { PuzzleType } from "../../core/types.ts";
import { problems, renderEditor } from "./editor.ts";
import type { NonogramData, NonogramMove, NonogramState } from "./logic.ts";
import { renderPlay, renderPreview } from "./render.ts";
import { nonogramRules } from "./rules.ts";

export const nonogram: PuzzleType<NonogramData, NonogramState, NonogramMove> = {
  ...nonogramRules,
  name: "nonogramName",
  description: "nonogramDescription",
  // A grid with filled cells and clue marks on top and left.
  icon: svg`<rect x="8" y="8" width="13" height="13" rx="1"/><path d="M8 14.5h13"/><path d="M14.5 8v13"/><path d="M3 11h2"/><path d="M3 18h2"/><path d="M11 3v2"/><path d="M18 3v2"/>`,
  color: { dark: "#B9DB6A", light: "#55731A" },
  controls: { moves: false },
  problems,
  themeParts: { board: "ngPartBoard", line: "ngPartLine", piece: "ngPartPiece", done: "ngPartDone" },
  renderPlay,
  renderEditor,
  renderPreview,
};
