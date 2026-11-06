import type { PuzzleRules } from "../../core/types.ts";
import { applyMove, createDefault, initState, isSolved, parseDraft, validate } from "./logic.ts";
import type { RushHourData, RushHourMove, RushHourState } from "./logic.ts";
import { solve } from "./solver.ts";

export const rushHourRules: PuzzleRules<RushHourData, RushHourState, RushHourMove> = {
  id: "rushhour",
  version: 1,
  ranking: "moves", // fewest moves, ties broken by time
  createDefault,
  validate,
  parseDraft,
  initState,
  applyMove,
  isSolved,
  solve,
  levels: { easy: 8, medium: 20 },
};
