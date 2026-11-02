import type { PuzzleType } from "../../core/types.ts";
import { problems, renderEditor } from "./editor.ts";
import type { LaserData, LaserMove, LaserState } from "./logic.ts";
import { renderPlay } from "./render.ts";
import { laserRules } from "./rules.ts";

export const laser: PuzzleType<LaserData, LaserState, LaserMove> = {
  ...laserRules,
  name: "laserName",
  description: "laserDescription",
  icon: "🔦",
  problems,
  renderPlay,
  renderEditor,
};
