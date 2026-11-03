import type { PuzzleRules } from "../../core/types.ts";
import { applyMove, createDefault, initState, isSolved, parseDraft, validate } from "./logic.ts";
import type { IceData, IceMove, IceState } from "./logic.ts";
import { solve } from "./solver.ts";

export const iceRules: PuzzleRules<IceData, IceState, IceMove> = {
  id: "ice",
  version: 1,
  createDefault,
  validate,
  parseDraft,
  initState,
  applyMove,
  isSolved,
  solve,
  levels: { easy: 4, medium: 9 },
};
