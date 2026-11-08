import type { PuzzleRules } from "../../core/types.ts";
import { applyMove, createDefault, initState, isSolved, parseDraft, validate } from "./logic.ts";
import type { NonogramData, NonogramMove, NonogramState } from "./logic.ts";

// No `solve` and no `levels`: a nonogram has no move count, so its difficulty comes from player ratings
// (like the quiz). Solvability and uniqueness are part of validate.
export const nonogramRules: PuzzleRules<NonogramData, NonogramState, NonogramMove> = {
  id: "nonogram",
  version: 1,
  ranking: "time", // moves are strokes and say little; fastest wins
  createDefault,
  validate,
  parseDraft,
  initState,
  applyMove,
  isSolved,
  themeRoles: ["board", "line", "piece", "done"],
};
