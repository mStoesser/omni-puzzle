import type { PuzzleRules } from "../../core/types.ts";
import { applyMove, createDefault, initState, isSolved, parseDraft, validate } from "./logic.ts";
import type { SokobanData, SokobanMove, SokobanState } from "./logic.ts";
import { solve } from "./solver.ts";

export const sokobanRules: PuzzleRules<SokobanData, SokobanState, SokobanMove> = {
  id: "sokoban",
  version: 1,
  ranking: "moves", // fewest moves, ties broken by time
  createDefault,
  validate,
  parseDraft,
  initState,
  applyMove,
  isSolved,
  solve,
  levels: { easy: 20, medium: 50 },
  themeRoles: ["board", "line", "wall", "figure", "piece", "target", "done"],
};
