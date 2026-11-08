import type { FixedColor } from "../../core/puzzle-theme.ts";
import type { PuzzleRules } from "../../core/types.ts";
import { VERSION, applyMove, createDefault, initState, isSolved, migrate, minVersion, parseDraft, validate } from "./logic.ts";
import type { Color, LaserData, LaserMove, LaserState } from "./logic.ts";
import { solve } from "./solver.ts";

/**
 * Laser colors belong to the rules (targets ask for a color, and screen readers name it), so themes cannot change
 * them (M29). Light variant on light boards, dark variant on dark ones; the contrast check tests both against themes.
 */
export const LASER_COLORS: Record<Color, FixedColor> = {
  red: { light: "#e3342f", dark: "#ff5a50" },
  green: { light: "#1f9d55", dark: "#4ade80" },
  blue: { light: "#2563eb", dark: "#7aa7ff" },
};

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
  themeRoles: ["board", "line", "wall", "figure", "piece", "target", "done"],
  themeFixed: Object.values(LASER_COLORS),
};
