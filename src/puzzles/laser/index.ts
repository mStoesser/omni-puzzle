import type { PuzzleType } from "../../core/types.ts";
import { problems, renderEditor } from "./editor.ts";
import { applyMove, createDefault, initState, isSolved, parseDraft, validate } from "./logic.ts";
import type { LaserData, LaserMove, LaserState } from "./logic.ts";
import { renderPlay } from "./render.ts";
import { solve } from "./solver.ts";

export const laser: PuzzleType<LaserData, LaserState, LaserMove> = {
  id: "laser",
  version: 1,
  name: "laserName",
  icon: "🔦",
  createDefault,
  validate,
  parseDraft,
  problems,
  initState,
  applyMove,
  isSolved,
  solve,
  renderPlay,
  renderEditor,
};
