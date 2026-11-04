import type { PuzzleRules } from "../../core/types.ts";
import { applyMove, createDefault, initState, isSolved, parseDraft, validate } from "./logic.ts";
import type { LightsOutData, LightsOutMove, LightsOutState } from "./logic.ts";
import { solve } from "./solver.ts";

export const lightsOutRules: PuzzleRules<LightsOutData, LightsOutState, LightsOutMove> = {
  id: "lightsout",
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
