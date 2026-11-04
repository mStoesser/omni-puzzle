import { breadthFirst } from "../../core/search.ts";
import type { SolveLimits, SolveResult } from "../../core/types.ts";
import { initState, isSolved, legalMoves } from "./logic.ts";
import type { KlotskiData, KlotskiMove, KlotskiState } from "./logic.ts";

/**
 * Breadth-first search; a move slides one block any distance (also around corners), so the result has
 * the minimal move count in the classic counting. Blocks of the same size are interchangeable: the state
 * key lists their positions sorted, which keeps the search space small (Huarong Dao: about 24 000 states).
 */
export function solve(data: KlotskiData, limits: SolveLimits): SolveResult<KlotskiMove> {
  const groups = sizeGroups(data);
  return breadthFirst<KlotskiState, KlotskiMove>(
    {
      start: initState(data),
      key: (state) => stateKey(groups, state),
      *next(state) {
        for (const move of legalMoves(data, state)) {
          const pos = [...state.pos];
          pos[move.block] = move.y * data.width + move.x;
          yield [move, { pos }] as const;
        }
      },
      isGoal: (state) => isSolved(data, state),
    },
    limits,
  );
}

/** Block indices grouped by interchangeability: the target alone, the others by size. */
export function sizeGroups(data: KlotskiData): number[][] {
  const groups = new Map<string, number[]>();
  data.blocks.forEach((b, i) => {
    const kind = b.target ? "t" : `${b.w}x${b.h}`;
    groups.set(kind, [...(groups.get(kind) ?? []), i]);
  });
  return [...groups.values()];
}

/** Canonical key: per group the sorted positions, one character each (positions are below 100). */
export function stateKey(groups: readonly number[][], state: KlotskiState): string {
  let key = "";
  for (const group of groups) {
    const positions = group.map((i) => state.pos[i]!).sort((a, b) => a - b);
    key += String.fromCharCode(...positions.map((p) => p + 32));
  }
  return key;
}
