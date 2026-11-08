import { svg } from "lit-html";
import type { PuzzleType } from "../../core/types.ts";
import { problems, renderEditor } from "./editor.ts";
import type { LaserData, LaserMove, LaserState } from "./logic.ts";
import { renderPlay } from "./render.ts";
import { laserRules } from "./rules.ts";

export const laser: PuzzleType<LaserData, LaserState, LaserMove> = {
  ...laserRules,
  name: "laserName",
  description: "laserDescription",
  icon: svg`<circle cx="4.5" cy="15.5" r="2"/><path d="M6.5 15.5H13l6-6"/><path d="M14 9.5h5v5"/>`,
  color: { dark: "#4FD8E8", light: "#0E7C8C" },
  problems,
  themeParts: { board: "lsPartBoard", line: "lsPartLine", wall: "lsPartWall", figure: "lsPartFigure", piece: "lsPartPiece", target: "lsPartTarget", done: "lsPartDone", fixed: "lsPartFixed" },
  renderPlay,
  renderEditor,
};
