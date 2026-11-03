import { breadthFirst } from "../../core/search.ts";
import type { Point } from "../../core/grid.ts";
import type { SolveLimits, SolveResult } from "../../core/types.ts";
import { initState, isGoal, nextPositions, prepare } from "./logic.ts";
import type { IceData, IceMove } from "./logic.ts";

/** Breadth-first search over the figure's position; finds the minimal number of slides. */
export function solve(data: IceData, limits: SolveLimits): SolveResult<IceMove> {
  const board = prepare(data);
  const start = initState(data);
  if (start.x < 0) return { status: "unsolvable" };
  return breadthFirst<Point, IceMove>(
    {
      start,
      key: (p) => `${p.x},${p.y}`,
      next: (p) => nextPositions(board, p),
      isGoal: (p) => isGoal(board, p),
    },
    limits,
  );
}
