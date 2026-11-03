import { breadthFirst } from "../../core/search.ts";
import type { SolveLimits, SolveResult } from "../../core/types.ts";
import { applyMove, initState, isSolved, legalMoves } from "./logic.ts";
import type { RushHourData, RushHourMove, RushHourState } from "./logic.ts";

/** Breadth-first search; a move is one contiguous slide, so the result has the minimal move count. */
export function solve(data: RushHourData, limits: SolveLimits): SolveResult<RushHourMove> {
  return breadthFirst(
    {
      start: initState(data),
      key: (state: RushHourState) => state.pos.join(","),
      *next(state: RushHourState) {
        for (const move of legalMoves(data, state)) yield [move, applyMove(data, state, move)!] as const;
      },
      isGoal: (state: RushHourState) => isSolved(data, state),
    },
    limits,
  );
}
