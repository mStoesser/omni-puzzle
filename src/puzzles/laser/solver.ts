import type { SolveLimits, SolveResult } from "../../core/types.ts";
import { EMPTY, MIRROR, initState, prepare, traceBoard } from "./logic.ts";
import type { LaserData, LaserMove } from "./logic.ts";

/**
 * Finds the fewest taps that light every target. A tap flips a rotatable mirror or splitter (cost 1),
 * or places a mirror from the inventory: "/" costs 1 tap, "\\" costs 2 (place, then flip).
 *
 * A change only matters where a beam enters: changing a cell no beam reaches does not change the trace.
 * So a cheapest solution only changes entered cells, and the search only tries those (pruning). Changes are made
 * in the order in which the trace first enters their cells: changing a cell leaves the trace before it untouched
 * (see traceBoard), so every set of changes is built exactly once, and each step only looks at cells after the
 * previous change. Iterative deepening over the cost finds the cheapest solution first. Each trace is one node.
 */
export function solve(data: LaserData, limits: SolveLimits): SolveResult<LaserMove> {
  const board = prepare(data, initState(data));
  const { cells, width } = board;
  if (board.targets === 0) return { status: "unsolvable" };
  const turnable = new Uint8Array(cells.length);
  for (const { x, y, cell } of data.cells) {
    if ((cell.kind === "mirror" || cell.kind === "splitter") && cell.rotatable) turnable[y * width + x] = 1;
  }

  let nodes = 0;
  let budgetHit = false; // some branch was cut by the budget, so a larger budget may find more
  let left = data.inventory ?? 0;
  const changes: { pos: number; taps: number }[] = [];

  // Tries all sets of further changes after order index `after` with total cost ≤ budget.
  function search(budget: number, cost: number, after: number): "solved" | "aborted" | null {
    if (++nodes > limits.maxNodes) return "aborted";
    const trace = traceBoard(board, false);
    if (trace.hitCount === board.targets) return cost === budget ? "solved" : null; // cheaper ones were tried before
    const { order } = trace;
    for (let i = after + 1; i < order.length; i++) {
      const pos = order[i]!;
      const code = cells[pos]!;
      if (turnable[pos]) {
        if (cost + 1 > budget) {
          budgetHit = true;
          continue;
        }
        cells[pos] = code ^ 1;
        changes.push({ pos, taps: 1 });
        const result = search(budget, cost + 1, i);
        if (result) return result;
        changes.pop();
        cells[pos] = code;
      } else if (code === EMPTY && left > 0) {
        for (const taps of [1, 2]) {
          if (cost + taps > budget) {
            budgetHit = true;
            continue;
          }
          cells[pos] = MIRROR | (taps - 1); // 1 tap: "/", 2 taps: "\\"
          left--;
          changes.push({ pos, taps });
          const result = search(budget, cost + taps, i);
          if (result) return result;
          changes.pop();
          left++;
          cells[pos] = EMPTY;
        }
      }
    }
    return null;
  }

  for (let budget = 0; ; budget++) {
    budgetHit = false;
    const result = search(budget, 0, -1);
    if (result === "aborted") return { status: "aborted" };
    if (result === "solved") {
      const moves: LaserMove[] = [];
      for (const { pos, taps } of changes) {
        const move = { x: pos % width, y: Math.floor(pos / width) };
        for (let t = 0; t < taps; t++) moves.push({ ...move });
      }
      return { status: "solved", moves };
    }
    if (!budgetHit) return { status: "unsolvable" };
  }
}
