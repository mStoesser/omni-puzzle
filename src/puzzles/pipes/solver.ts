import { DELTA, DIRS, opposite } from "../../core/grid.ts";
import type { SolveLimits, SolveResult } from "../../core/types.ts";
import { BIT, canTurn, height, isFixed, maskAt, rotateMask, width } from "./logic.ts";
import type { PipesData, PipesMove } from "./logic.ts";

// Backtracking over the orientation of every tile, with constraint propagation and branch & bound.
//
// The domain of a cell is the set of masks it can still take, as a 16-bit set (bit m = mask m).
// Two neighbours must agree on the pipe end between them, and no pipe end may point off the board;
// propagation removes masks that cannot agree. A search node is pruned when the cheapest remaining
// turns cannot beat the best solution so far, or when some pipe can no longer be connected to the source.
// The cost of a tile is the number of clockwise quarter turns to reach its mask (0–3), so the result
// has the minimal number of taps.

/** Masks (as a 16-bit set) that have a pipe end towards each direction. */
const WITH = Object.fromEntries(
  DIRS.map((dir) => {
    let set = 0;
    for (let m = 0; m < 16; m++) if (m & BIT[dir]) set |= 1 << m;
    return [dir, set];
  }),
) as Record<(typeof DIRS)[number], number>;

const ALL = 0xffff;

type Board = {
  w: number;
  h: number;
  /** Turns needed per cell and mask; -1 = unreachable. */
  cost: Int8Array[];
  /** Neighbour cell per direction, -1 at the edge. */
  next: Int16Array[];
  /** Number of cells that hold a pipe, and which ones (1 = pipe). */
  pipes: number;
  hasPipe: Uint8Array;
  source: number;
};

export function solve(data: PipesData, limits: SolveLimits): SolveResult<PipesMove> {
  const board = prepare(data);
  const domains = new Uint16Array(board.w * board.h);
  board.cost.forEach((costs, cell) => {
    for (let m = 0; m < 16; m++) if (costs[m]! >= 0) domains[cell]! |= 1 << m;
    // No pipe end may point off the board.
    DIRS.forEach((dir, d) => {
      if (board.next[cell]![d]! < 0) domains[cell]! &= ~WITH[dir] & ALL;
    });
  });
  const all = [...domains.keys()];
  if (!propagate(board, domains, all)) return { status: "unsolvable" };

  let best: { cost: number; domains: Uint16Array } | null = null;
  let nodes = 0;
  let aborted = false;

  const search = (doms: Uint16Array) => {
    if (aborted) return;
    if (++nodes > limits.maxNodes) {
      aborted = true;
      return;
    }
    if (best && lowerBound(board, doms) >= best.cost) return;
    if (!sourceReachesAll(board, doms)) return;
    // Branch on the undecided cell with the fewest masks left.
    let cell = -1;
    let size = 17;
    for (let c = 0; c < doms.length; c++) {
      const n = popcount(doms[c]!);
      if (n > 1 && n < size) {
        cell = c;
        size = n;
      }
    }
    if (cell < 0) {
      best = { cost: lowerBound(board, doms), domains: doms };
      return;
    }
    const masks = maskList(doms[cell]!).sort((a, b) => board.cost[cell]![a]! - board.cost[cell]![b]!);
    for (const mask of masks) {
      const child = doms.slice();
      child[cell] = 1 << mask;
      if (propagate(board, child, [cell])) search(child);
      if (aborted) return;
    }
  };
  search(domains);

  if (aborted) return { status: "aborted" };
  if (!best) return { status: "unsolvable" };
  const solved: Uint16Array = (best as { domains: Uint16Array }).domains;
  const moves: PipesMove[] = [];
  solved.forEach((dom, cell) => {
    const turns = board.cost[cell]![31 - Math.clz32(dom)]!;
    for (let k = 0; k < turns; k++) moves.push({ x: cell % board.w, y: Math.floor(cell / board.w) });
  });
  return { status: "solved", moves };
}

function prepare(data: PipesData): Board {
  const w = width(data);
  const h = height(data);
  const cost: Int8Array[] = [];
  const next: Int16Array[] = [];
  const hasPipe = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const base = maskAt(data, x, y);
      const costs = new Int8Array(16).fill(-1);
      const turnable = canTurn(base) && !isFixed(data, x, y);
      for (let k = turnable ? 3 : 0; k >= 0; k--) costs[rotateMask(base, k)] = k; // lowest k wins
      cost.push(costs);
      next.push(
        Int16Array.from(DIRS, (dir) => {
          const [dx, dy] = DELTA[dir];
          const nx = x + dx;
          const ny = y + dy;
          return nx < 0 || ny < 0 || nx >= w || ny >= h ? -1 : ny * w + nx;
        }),
      );
      if (base) hasPipe[y * w + x] = 1;
    }
  }
  const pipes = hasPipe.reduce((sum, v) => sum + v, 0);
  return { w, h, cost, next, pipes, hasPipe, source: data.source.y * w + data.source.x };
}

/**
 * Makes neighbours agree on the pipe ends between them, starting from the given cells: only a cell's
 * neighbours shrink, so each changed neighbour is queued in turn. Changes `doms` in place; false if
 * some cell has no mask left.
 */
function propagate(board: Board, doms: Uint16Array, start: number[]): boolean {
  if (start.some((cell) => doms[cell] === 0)) return false;
  const queue = [...start];
  const queued = new Uint8Array(doms.length);
  for (const c of start) queued[c] = 1;
  while (queue.length > 0) {
    const cell = queue.pop()!;
    queued[cell] = 0;
    const dom = doms[cell]!;
    for (let d = 0; d < 4; d++) {
      const nb = board.next[cell]![d]!;
      if (nb < 0) continue;
      const dir = DIRS[d]!;
      const back = WITH[opposite(dir)];
      let nd = doms[nb]!;
      if (!(dom & WITH[dir])) nd &= ~back & ALL; // this side is surely closed
      if (!(dom & ~WITH[dir] & ALL)) nd &= back; // this side is surely open
      if (nd === doms[nb]) continue;
      if (nd === 0) return false;
      doms[nb] = nd;
      if (!queued[nb]) {
        queued[nb] = 1;
        queue.push(nb);
      }
    }
  }
  return true;
}

/** Cheapest turns still possible: every cell independently at its cheapest remaining mask. */
function lowerBound(board: Board, doms: Uint16Array): number {
  let sum = 0;
  doms.forEach((dom, cell) => {
    let min = 4;
    for (let m = 0; m < 16; m++) if (dom & (1 << m)) min = Math.min(min, board.cost[cell]![m]!);
    sum += min;
  });
  return sum;
}

/** Whether every pipe can still be reached from the source over pipe ends that both sides may still have. */
function sourceReachesAll(board: Board, doms: Uint16Array): boolean {
  const seen = new Uint8Array(doms.length);
  seen[board.source] = 1;
  const queue = [board.source];
  let reached = 0;
  for (let i = 0; i < queue.length; i++) {
    const cell = queue[i]!;
    reached += board.hasPipe[cell]!;
    DIRS.forEach((dir, d) => {
      const nb = board.next[cell]![d]!;
      if (nb < 0 || seen[nb] || !(doms[cell]! & WITH[dir]) || !(doms[nb]! & WITH[opposite(dir)])) return;
      seen[nb] = 1;
      queue.push(nb);
    });
  }
  return reached === board.pipes;
}

function maskList(dom: number): number[] {
  const masks: number[] = [];
  for (let m = 0; m < 16; m++) if (dom & (1 << m)) masks.push(m);
  return masks;
}

function popcount(v: number): number {
  let n = 0;
  for (let x = v; x; x &= x - 1) n++;
  return n;
}
