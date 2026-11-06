import type { PuzzleRules } from "../../core/types.ts";
import { applyMove, createDefault, initState, isSolved, parseDraft, validate } from "./logic.ts";
import type { KlotskiData, KlotskiMove, KlotskiState } from "./logic.ts";
import { solve } from "./solver.ts";

export const klotskiRules: PuzzleRules<KlotskiData, KlotskiState, KlotskiMove> = {
  id: "klotski",
  version: 1,
  ranking: "moves", // fewest moves, ties broken by time
  createDefault,
  validate,
  parseDraft,
  initState,
  applyMove,
  isSolved,
  solve,
  levels: { easy: 12, medium: 35 },
};
