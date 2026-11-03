import { breadthFirst } from "../../core/search.ts";
import type { SolveLimits, SolveResult } from "../../core/types.ts";
import { DIRS } from "../../core/grid.ts";
import { initState, liveCells, neighbour, prepare, stepOn } from "./logic.ts";
import type { SokobanData, SokobanMove, SokobanState } from "./logic.ts";

/**
 * Breadth-first search over (figure, boxes), so the result has the minimal number of steps.
 * Boxes are compared as a set; pushes onto dead squares (from which no goal is reachable) are skipped.
 */
export function solve(data: SokobanData, limits: SolveLimits): SolveResult<SokobanMove> {
  const board = prepare(data);
  const start = initState(data);
  if (start.player < 0 || start.boxes.length === 0) return { status: "unsolvable" };
  const live = liveCells(board);
  if (start.boxes.some((b) => !live[b])) return { status: "unsolvable" };
  return breadthFirst<SokobanState, SokobanMove>(
    {
      start,
      key: (s) => `${s.player}|${[...s.boxes].sort((a, b) => a - b).join(",")}`,
      *next(s) {
        for (const dir of DIRS) {
          const child = stepOn(board, s, dir);
          if (!child) continue;
          // A push moves the box onto the figure's new cell + dir; skip it if that cell is dead.
          if (child.boxes !== s.boxes && !live[neighbour(board, child.player, dir)]) continue;
          yield [dir, child] as const;
        }
      },
      isGoal: (s) => s.boxes.every((b) => board.goals[b]),
    },
    limits,
  );
}
