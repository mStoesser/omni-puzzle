import type { SolveLimits, SolveResult } from "../../core/types.ts";
import { initState, toggled, width } from "./logic.ts";
import type { LightsOutData, LightsOutMove, LightsOutState } from "./logic.ts";

// Tapping twice undoes a tap and the order of taps does not matter, so a solution is a set of cells x
// with A·x = b over GF(2): A says which cells a tap toggles, b which lights are on.
// Gaussian elimination finds one solution (or proves there is none); every solution differs from it by a
// vector of the null space. Trying all 2^k combinations of the k null space vectors (Gray code: one
// XOR per step) gives the solution with the fewest taps. 2^k counts as the number of search nodes.

/** A bit set over the active cells, 32 cells per word. */
type Bits = Uint32Array;

export function solve(data: LightsOutData, limits: SolveLimits): SolveResult<LightsOutMove> {
  return solveFrom(data, initState(data), limits);
}

/** Like solve, but from any state (e.g. to give a hint during play). */
export function solveFrom(data: LightsOutData, state: LightsOutState, limits: SolveLimits): SolveResult<LightsOutMove> {
  const w = width(data);
  const cells: number[] = []; // active cell → cell index
  const column = new Map<number, number>(); // cell index → active cell
  data.rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === "#") return;
      column.set(y * w + x, cells.length);
      cells.push(y * w + x);
    }),
  );
  const n = cells.length;
  const words = Math.ceil((n + 1) / 32); // n columns plus the right-hand side
  const rhs = n;

  // Row i: the taps that toggle cell i (A is symmetric, so this is also what tapping cell i toggles).
  const rows: Bits[] = cells.map((cell, i) => {
    const row = new Uint32Array(words);
    for (const other of toggled(data, cell % w, Math.floor(cell / w))) set(row, column.get(other)!);
    if (state.on[cells[i]!]) set(row, rhs);
    return row;
  });

  // Reduced row echelon form.
  const pivotOf: number[] = []; // pivot column per pivot row
  let r = 0;
  for (let c = 0; c < n && r < n; c++) {
    let p = r;
    while (p < n && !get(rows[p]!, c)) p++;
    if (p === n) continue;
    [rows[r], rows[p]] = [rows[p]!, rows[r]!];
    for (let i = 0; i < n; i++) if (i !== r && get(rows[i]!, c)) xor(rows[i]!, rows[r]!);
    pivotOf.push(c);
    r++;
  }
  // A zero row with right-hand side 1 means 0 = 1: some lights can never be switched off together.
  for (let i = r; i < n; i++) if (get(rows[i]!, rhs)) return { status: "unsolvable" };

  const isPivot = new Uint8Array(n);
  for (const c of pivotOf) isPivot[c] = 1;
  const free = [...Array(n).keys()].filter((c) => !isPivot[c]);
  if (2 ** free.length > limits.maxNodes) return { status: "aborted" };

  // Particular solution: free variables 0, each pivot variable equals its row's right-hand side.
  const best = new Uint32Array(words);
  pivotOf.forEach((c, i) => {
    if (get(rows[i]!, rhs)) set(best, c);
  });
  // Null space basis: one vector per free column f (x_f = 1, pivot variables from column f).
  const basis = free.map((f) => {
    const v = new Uint32Array(words);
    set(v, f);
    pivotOf.forEach((c, i) => {
      if (get(rows[i]!, f)) set(v, c);
    });
    return v;
  });

  const current = best.slice();
  let bestCount = count(best);
  for (let k = 1; k < 2 ** basis.length; k++) {
    xor(current, basis[31 - Math.clz32(k & -k)]!); // Gray code: flip the lowest set bit of k
    const taps = count(current);
    if (taps < bestCount) {
      bestCount = taps;
      best.set(current);
    }
  }

  const moves: LightsOutMove[] = [];
  for (let c = 0; c < n; c++) {
    if (get(best, c)) moves.push({ x: cells[c]! % w, y: Math.floor(cells[c]! / w) });
  }
  return { status: "solved", moves };
}

function get(bits: Bits, i: number): boolean {
  return ((bits[i >>> 5]! >>> (i & 31)) & 1) === 1;
}

function set(bits: Bits, i: number) {
  bits[i >>> 5]! |= 1 << (i & 31);
}

function xor(target: Bits, source: Bits) {
  for (let i = 0; i < target.length; i++) target[i]! ^= source[i]!;
}

/** Number of set bits, without the right-hand side column (always 0 in solution vectors). */
function count(bits: Bits): number {
  let total = 0;
  for (let v of bits) {
    v -= (v >>> 1) & 0x55555555;
    v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
    total += (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
  }
  return total;
}
