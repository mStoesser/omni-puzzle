import { svg } from "lit-html";
import type { PuzzleType } from "../../core/types.ts";
import { problems, renderEditor } from "./editor.ts";
import type { PipesData, PipesMove, PipesState } from "./logic.ts";
import { renderPlay, renderPreview } from "./render.ts";
import { pipesRules } from "./rules.ts";

export const pipes: PuzzleType<PipesData, PipesState, PipesMove> = {
  ...pipesRules,
  name: "pipesName",
  description: "pipesDescription",
  // A pipe with a bend and a T-junction.
  icon: svg`<path d="M3 7h6a4 4 0 0 1 4 4v10"/><path d="M13 14h8"/><path d="M3 4v6"/><path d="M21 11v6"/>`,
  color: { dark: "#93A0FF", light: "#4152B8" },
  problems,
  themeParts: { board: "ppPartBoard", line: "ppPartLine", wall: "ppPartWall", figure: "ppPartFigure", piece: "ppPartPiece", done: "ppPartDone" },
  renderPlay,
  renderEditor,
  renderPreview,
};
