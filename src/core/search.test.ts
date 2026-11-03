import { test } from "node:test";
import assert from "node:assert/strict";
import { breadthFirst } from "./search.ts";
import type { SearchProblem } from "./search.ts";

// Number line: moves +1 / ×2 from `start` to `goal`, values above `max` are not allowed.
function numbers(start: number, goal: number, max = 1000): SearchProblem<number, string> {
  return {
    start,
    key: String,
    *next(n) {
      if (n + 1 <= max) yield ["+1", n + 1];
      if (n * 2 <= max) yield ["×2", n * 2];
    },
    isGoal: (n) => n === goal,
  };
}

const LIMITS = { maxNodes: 10_000 };

test("finds a shortest path", () => {
  // 1 → 2 → 4 → 5 → 10: four moves; the first move found wins ties (+1 before ×2).
  assert.deepEqual(breadthFirst(numbers(1, 10), LIMITS), { status: "solved", moves: ["+1", "×2", "+1", "×2"] });
});

test("start that is already the goal needs no moves", () => {
  assert.deepEqual(breadthFirst(numbers(7, 7), LIMITS), { status: "solved", moves: [] });
});

test("unreachable goal is unsolvable", () => {
  assert.deepEqual(breadthFirst(numbers(5, 3), LIMITS), { status: "unsolvable" });
});

test("gives up at the node limit", () => {
  assert.deepEqual(breadthFirst(numbers(1, 999), { maxNodes: 20 }), { status: "aborted" });
});

test("states with equal keys are visited once", () => {
  // Pairs whose order does not matter: the canonical key makes [1,2] and [2,1] the same state.
  let expanded = 0;
  const problem: SearchProblem<readonly number[], number> = {
    start: [0, 0],
    key: (s) => [...s].sort((a, b) => a - b).join(","),
    *next(s) {
      expanded++;
      for (let i = 0; i < s.length; i++) {
        if (s[i]! < 3) yield [i, s.map((v, j) => (j === i ? v + 1 : v))];
      }
    },
    isGoal: () => false,
  };
  assert.equal(breadthFirst(problem, LIMITS).status, "unsolvable");
  // Unordered pairs from {0..3}: 10 states, each expanded once.
  assert.equal(expanded, 10);
});
