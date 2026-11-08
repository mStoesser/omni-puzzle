import type { PuzzleRules } from "../../core/types.ts";
import { applyMove, createDefault, initState, isSolved, parseDraft, validate } from "./logic.ts";
import type { PipesData, PipesMove, PipesState } from "./logic.ts";
import { solve } from "./solver.ts";

export const pipesRules: PuzzleRules<PipesData, PipesState, PipesMove> = {
  id: "pipes",
  version: 1,
  ranking: "moves", // fewest moves, ties broken by time
  createDefault,
  validate,
  parseDraft,
  initState,
  applyMove,
  isSolved,
  solve,
  levels: { easy: 12, medium: 30 },
  themeRoles: ["board", "line", "wall", "figure", "piece", "done"],
};
