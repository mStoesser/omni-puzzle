import type { SolveLimits, SolveResult } from "./types.ts";

/** A state space for the solvers of puzzle types. States must not be mutated. */
export type SearchProblem<S, M> = {
  start: S;
  /** Equal keys mean equal states (canonical form, e.g. interchangeable pieces sorted). */
  key(state: S): string;
  /** Legal moves with the state each one leads to. */
  next(state: S): Iterable<readonly [M, S]>;
  isGoal(state: S): boolean;
};

type Parent<M> = { prev: string; move: M } | null;

/**
 * Breadth-first search: the first goal found has the minimal number of moves.
 * Gives up with "aborted" once `maxNodes` distinct states are known.
 */
export function breadthFirst<S, M>(problem: SearchProblem<S, M>, limits: SolveLimits): SolveResult<M> {
  const { start, key, next, isGoal } = problem;
  if (isGoal(start)) return { status: "solved", moves: [] };

  const parents = new Map<string, Parent<M>>([[key(start), null]]);
  let frontier: S[] = [start];

  while (frontier.length > 0) {
    const following: S[] = [];
    for (const state of frontier) {
      const stateKey = key(state);
      for (const [move, child] of next(state)) {
        const childKey = key(child);
        if (parents.has(childKey)) continue;
        parents.set(childKey, { prev: stateKey, move });
        if (isGoal(child)) return { status: "solved", moves: path(parents, childKey) };
        if (parents.size >= limits.maxNodes) return { status: "aborted" };
        following.push(child);
      }
    }
    frontier = following;
  }
  return { status: "unsolvable" };
}

function path<M>(parents: Map<string, Parent<M>>, end: string): M[] {
  const moves: M[] = [];
  for (let step = parents.get(end); step; step = parents.get(step.prev)) moves.push(step.move);
  return moves.reverse();
}
