import type { PuzzleRules } from "../../core/types.ts";
import { applyMove, createDefault, initState, isSolved, parseDraft, validate } from "./logic.ts";
import type { LaserData, LaserMove, LaserState } from "./logic.ts";
import { solve } from "./solver.ts";

export const laserRules: PuzzleRules<LaserData, LaserState, LaserMove> = {
  id: "laser",
  version: 1,
  createDefault,
  validate,
  parseDraft,
  initState,
  applyMove,
  isSolved,
  solve,
  levels: { easy: 3, medium: 7 },
};
