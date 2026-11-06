import type { PuzzleRules } from "../../core/types.ts";
import { VERSION, applyMove, createDefault, initState, isSolved, migrate, minVersion, parseDraft, validate } from "./logic.ts";
import type { LaserData, LaserMove, LaserState } from "./logic.ts";
import { solve } from "./solver.ts";

export const laserRules: PuzzleRules<LaserData, LaserState, LaserMove> = {
  id: "laser",
  version: VERSION, // 2: inventory, 3: beam splitters, 4: colors
  ranking: "moves", // fewest moves, ties broken by time
  createDefault,
  validate,
  migrate,
  minVersion,
  parseDraft,
  initState,
  applyMove,
  isSolved,
  solve,
  levels: { easy: 3, medium: 7 },
};
