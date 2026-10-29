import type { SolveLimits, SolveResult } from "../../core/types.ts";
import { applyMove, initState, isSolved, legalMoves } from "./logic.ts";
import type { RushHourData, RushHourMove, RushHourState } from "./logic.ts";

/** Breadth-first search; a move is one contiguous slide, so the result has the minimal move count. */
export function solve(data: RushHourData, limits: SolveLimits): SolveResult<RushHourMove> {
  const start = initState(data);
  if (isSolved(data, start)) return { status: "solved", moves: [] };

  const key = (state: RushHourState) => state.pos.join(",");
  const parents = new Map<string, { prev: string; move: RushHourMove } | null>([[key(start), null]]);
  let frontier = [start];

  while (frontier.length > 0) {
    const next: RushHourState[] = [];
    for (const state of frontier) {
      const stateKey = key(state);
      for (const move of legalMoves(data, state)) {
        const child = applyMove(data, state, move)!;
        const childKey = key(child);
        if (parents.has(childKey)) continue;
        parents.set(childKey, { prev: stateKey, move });
        if (isSolved(data, child)) return { status: "solved", moves: path(parents, childKey) };
        if (parents.size >= limits.maxNodes) return { status: "aborted" };
        next.push(child);
      }
    }
    frontier = next;
  }
  return { status: "unsolvable" };
}

function path(parents: Map<string, { prev: string; move: RushHourMove } | null>, end: string): RushHourMove[] {
  const moves: RushHourMove[] = [];
  for (let step = parents.get(end); step; step = parents.get(step.prev)) moves.push(step.move);
  return moves.reverse();
}
