import type { SolveLimits, SolveResult } from "../../core/types.ts";
import { flip, prepare, targetCount, traceBoard } from "./logic.ts";
import type { LaserData, LaserMove, Orientation } from "./logic.ts";

/**
 * Brute force over the rotatable mirrors. Every move flips one mirror, and flipping twice
 * undoes it, so a solution is a set of mirrors to flip. Sets are tried by increasing size;
 * the first hit uses the fewest moves. Each tried set counts as one node.
 */
export function solve(data: LaserData, limits: SolveLimits): SolveResult<LaserMove> {
  const board = prepare(data);
  const targets = targetCount(data);
  const rotatable: number[] = [];
  const orientation: Orientation[] = [];
  data.cells.forEach(({ cell }, i) => {
    if (cell.kind === "mirror") orientation[i] = cell.orientation;
    if (cell.kind === "mirror" && cell.rotatable) rotatable.push(i);
  });

  let nodes = 0;
  const flipped: number[] = [];
  let solution: LaserMove[] | null = null;

  // Tries all sets of `size` mirrors, extending `flipped` with mirrors from rotatable[from..].
  function search(size: number, from: number): "solved" | "aborted" | null {
    if (flipped.length === size) {
      if (++nodes > limits.maxNodes) return "aborted";
      if (targets === 0 || traceBoard(board, (i) => orientation[i]!).hit.size !== targets) return null;
      solution = flipped.map((i) => ({ x: data.cells[i]!.x, y: data.cells[i]!.y }));
      return "solved";
    }
    for (let r = from; r <= rotatable.length - (size - flipped.length); r++) {
      const i = rotatable[r]!;
      orientation[i] = flip(orientation[i]!);
      flipped.push(i);
      const result = search(size, r + 1);
      flipped.pop();
      orientation[i] = flip(orientation[i]!);
      if (result) return result;
    }
    return null;
  }

  for (let size = 0; size <= rotatable.length; size++) {
    const result = search(size, 0);
    if (result === "aborted") return { status: "aborted" };
    if (result === "solved") return { status: "solved", moves: solution! };
  }
  return { status: "unsolvable" };
}
