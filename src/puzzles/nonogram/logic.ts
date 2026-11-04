// Nonogram: fill cells so that every row and column shows exactly its clue (lengths of the filled runs, in order).
// The data holds only the clues, not the picture, so a link does not give the solution away.
// Editor drafts may also carry the picture they were drawn from (`image`); validate drops it (see shareableDocument).

export type NonogramData = {
  width: number;
  height: number;
  rows: number[][]; // clue per row, top to bottom; [] = empty row
  cols: number[][]; // clue per column, left to right
  /** Editor only: the drawn picture, one string per row, "#" filled, "." empty. */
  image?: string[];
};

/** One character per cell (y · width + x): "." open, "#" filled, "x" crossed out (marked as empty). */
export type NonogramState = { cells: string };

export type Mark = "#" | "x" | ".";

/** Set these cells to `mark` (a drag over a row or column is one move). */
export type NonogramMove = { cells: number[]; mark: Mark };

export const LIMITS = {
  minSize: 3,
  maxSize: 15,
  /** Guesses (search nodes) the analysis may make before it gives up; the same in editor, app and server. */
  maxGuesses: 2000,
} as const;

export type ProblemCode =
  | "clue-too-long" // a clue does not fit into its line
  | "count-mismatch" // rows and columns ask for a different number of filled cells
  | "unsolvable"
  | "ambiguous" // more than one picture fits the clues
  | "too-hard"; // the analysis gave up

export type Problem = { code: ProblemCode };

export function createDefault(): NonogramData {
  // A small plus sign.
  return fromImage([".....", "..#..", ".###.", "..#..", "....."]);
}

/** Lengths of the filled runs of a line. */
export function runs(line: ArrayLike<boolean>): number[] {
  const result: number[] = [];
  let run = 0;
  for (let i = 0; i < line.length; i++) {
    if (line[i]) run++;
    else if (run > 0) {
      result.push(run);
      run = 0;
    }
  }
  if (run > 0) result.push(run);
  return result;
}

/** Data with the clues of a picture ("#" filled), keeping the picture for the editor. */
export function fromImage(image: string[]): NonogramData {
  const height = image.length;
  const width = image[0]?.length ?? 0;
  const filled = (x: number, y: number) => image[y]![x] === "#";
  return {
    width,
    height,
    rows: image.map((_, y) => runs(Array.from({ length: width }, (_, x) => filled(x, y)))),
    cols: Array.from({ length: width }, (_, x) => runs(Array.from({ length: height }, (_, y) => filled(x, y)))),
    image: [...image],
  };
}

export function findProblems(data: NonogramData): Problem[] {
  const fits = (clue: number[], length: number) => clue.reduce((a, b) => a + b, 0) + Math.max(0, clue.length - 1) <= length;
  if (!data.rows.every((c) => fits(c, data.width)) || !data.cols.every((c) => fits(c, data.height))) {
    return [{ code: "clue-too-long" }];
  }
  const total = (clues: number[][]) => clues.flat().reduce((a, b) => a + b, 0);
  if (total(data.rows) !== total(data.cols)) return [{ code: "count-mismatch" }];
  const result = analyze(data);
  if (result.status === "none") return [{ code: "unsolvable" }];
  if (result.status === "multiple") return [{ code: "ambiguous" }];
  if (result.status === "aborted") return [{ code: "too-hard" }];
  return [];
}

/** Validates untrusted data: the clues must have exactly one solution. Returns a copy without the editor picture. */
export function validate(raw: unknown): NonogramData {
  const { image: _, ...data } = parseDraft(raw);
  const problems = findProblems(data);
  if (problems.length > 0) throw new Error(`invalid puzzle: ${problems.map((p) => p.code).join(", ")}`);
  return data;
}

/** Checks only the structure and returns a clean copy (with the editor picture, if any). */
export function parseDraft(raw: unknown): NonogramData {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("data is not an object");
  const r = raw as Record<string, unknown>;
  const width = intIn(r.width, LIMITS.minSize, LIMITS.maxSize, "width");
  const height = intIn(r.height, LIMITS.minSize, LIMITS.maxSize, "height");
  const clues = (value: unknown, count: number, length: number, field: string): number[][] => {
    if (!Array.isArray(value) || value.length !== count) throw new Error(field);
    return value.map((clue: unknown) => {
      if (!Array.isArray(clue) || clue.length > Math.ceil(length / 2)) throw new Error(`${field} clue`);
      return clue.map((n: unknown) => intIn(n, 1, length, `${field} number`));
    });
  };
  const data: NonogramData = {
    width,
    height,
    rows: clues(r.rows, height, width, "rows"),
    cols: clues(r.cols, width, height, "cols"),
  };
  if (r.image !== undefined) {
    const image = r.image;
    if (!Array.isArray(image) || image.length !== height) throw new Error("image");
    for (const row of image) if (typeof row !== "string" || !/^[#.]*$/.test(row) || row.length !== width) throw new Error("image row");
    data.image = [...image] as string[];
  }
  return data;
}

export function initState(data: NonogramData): NonogramState {
  return { cells: ".".repeat(data.width * data.height) };
}

export function applyMove(data: NonogramData, state: NonogramState, move: NonogramMove): NonogramState | null {
  const { cells, mark } = move;
  if (mark !== "#" && mark !== "x" && mark !== ".") return null;
  if (!Array.isArray(cells) || cells.length === 0 || cells.length > Math.max(data.width, data.height)) return null;
  const next = [...state.cells];
  let changed = false;
  for (const cell of cells) {
    if (!Number.isInteger(cell) || cell < 0 || cell >= next.length) return null;
    if (next[cell] !== mark) changed = true;
    next[cell] = mark;
  }
  return changed ? { cells: next.join("") } : null;
}

/** Whether a row (or column) of the current state shows exactly its clue. */
export function lineDone(data: NonogramData, state: NonogramState, axis: "row" | "col", index: number): boolean {
  const length = axis === "row" ? data.width : data.height;
  const line = Array.from({ length }, (_, k) =>
    state.cells[axis === "row" ? index * data.width + k : k * data.width + index] === "#",
  );
  const clue = axis === "row" ? data.rows[index]! : data.cols[index]!;
  const found = runs(line);
  return found.length === clue.length && found.every((n, i) => n === clue[i]);
}

export function isSolved(data: NonogramData, state: NonogramState): boolean {
  for (let y = 0; y < data.height; y++) if (!lineDone(data, state, "row", y)) return false;
  for (let x = 0; x < data.width; x++) if (!lineDone(data, state, "col", x)) return false;
  return true;
}

// --- Analysis: line solving with propagation, guessing only where needed. ---

/** "#"/"." per cell (row by row) for found solutions. */
export type Analysis =
  | { status: "unique"; solution: string; guessed: boolean }
  | { status: "multiple"; solutions: [string, string] }
  | { status: "none" }
  | { status: "aborted" };

const cache = new WeakMap<NonogramData, Analysis>();

/**
 * Finds out whether the clues have no, exactly one or several solutions (stops at two).
 * Cached per data object: editor, validation and rendering ask often.
 */
export function analyze(data: NonogramData, maxGuesses: number = LIMITS.maxGuesses): Analysis {
  const cached = maxGuesses === LIMITS.maxGuesses ? cache.get(data) : undefined;
  if (cached) return cached;
  const result = search(data, maxGuesses);
  if (maxGuesses === LIMITS.maxGuesses) cache.set(data, result);
  return result;
}

const UNKNOWN = -1;

function search(data: NonogramData, maxGuesses: number): Analysis {
  const { width: w, height: h } = data;
  const lines = [
    ...data.rows.map((clue, y) => ({ clue, cells: Array.from({ length: w }, (_, x) => y * w + x) })),
    ...data.cols.map((clue, x) => ({ clue, cells: Array.from({ length: h }, (_, y) => y * w + x) })),
  ];
  // Lines through each cell: its row and its column.
  const through = (cell: number) => [Math.floor(cell / w), h + (cell % w)];
  const solvers = lines.map((line) => lineSolver(line.clue, line.cells.length));

  const propagate = (grid: Int8Array, dirty: Set<number>): boolean => {
    const buffer = new Int8Array(Math.max(w, h));
    while (dirty.size > 0) {
      const index = dirty.values().next().value!;
      dirty.delete(index);
      const { cells } = lines[index]!;
      const line = buffer.subarray(0, cells.length);
      cells.forEach((cell, k) => (line[k] = grid[cell]!));
      const solved = solvers[index]!(line);
      if (!solved) return false;
      cells.forEach((cell, k) => {
        if (grid[cell] === UNKNOWN && solved[k] !== UNKNOWN) {
          grid[cell] = solved[k]!;
          for (const other of through(cell)) if (other !== index) dirty.add(other);
        }
      });
    }
    return true;
  };

  // Guess where the row and column are best known: the guess then decides the most.
  const guessCell = (grid: Int8Array): number => {
    const openInRow = new Int16Array(h);
    const openInCol = new Int16Array(w);
    grid.forEach((v, cell) => {
      if (v !== UNKNOWN) return;
      openInRow[Math.floor(cell / w)]!++;
      openInCol[cell % w]!++;
    });
    let best = -1;
    let bestOpen = Infinity;
    grid.forEach((v, cell) => {
      if (v !== UNKNOWN) return;
      const open = openInRow[Math.floor(cell / w)]! + openInCol[cell % w]!;
      if (open < bestOpen) {
        best = cell;
        bestOpen = open;
      }
    });
    return best;
  };

  const solutions: string[] = [];
  let guesses = 0;
  let aborted = false;
  const visit = (grid: Int8Array, dirty: Set<number>) => {
    if (aborted || solutions.length >= 2 || !propagate(grid, dirty)) return;
    const open = guessCell(grid);
    if (open < 0) {
      solutions.push(Array.from(grid, (v) => (v === 1 ? "#" : ".")).join(""));
      return;
    }
    for (const value of [1, 0]) {
      if (++guesses > maxGuesses) {
        aborted = true;
        return;
      }
      const child = grid.slice();
      child[open] = value;
      visit(child, new Set(through(open)));
      if (aborted || solutions.length >= 2) return;
    }
  };
  visit(new Int8Array(w * h).fill(UNKNOWN), new Set(lines.keys()));

  if (solutions.length >= 2) return { status: "multiple", solutions: [solutions[0]!, solutions[1]!] };
  if (aborted) return { status: "aborted" };
  if (solutions.length === 0) return { status: "none" };
  return { status: "unique", solution: solutions[0]!, guessed: guesses > 0 };
}

/**
 * A solver for one line with a fixed clue: given known cells (1 filled, 0 empty, -1 unknown), it returns every
 * cell that all placements of the clue agree on, or null if the clue cannot be placed at all.
 *
 * The clue is an automaton over the cells: a gap state (zeros allowed) before each block, one state per block
 * cell, a gap state at the end; a block must be followed by at least one zero. Which states are reachable from
 * the start (forward) and from the end (backward) shows which values each cell can take. A line has at most
 * 15 cells, so there are at most 17 states and the state sets fit into one 32-bit number.
 */
export function lineSolver(clue: readonly number[], length: number): (line: Int8Array) => Int8Array | null {
  const next0: number[] = [];
  const next1: number[] = [];
  const gap: number[] = []; // state index of the gap before block j (and after the last block)
  for (let j = 0; j <= clue.length; j++) {
    gap.push(next0.length);
    next0.push(next0.length); // a gap state loops on 0 …
    next1.push(j < clue.length ? next0.length : -1); // … and starts the next block on 1
    if (j === clue.length) break;
    for (let m = 1; m <= clue[j]!; m++) {
      const state = next0.length;
      next1.push(m < clue[j]! ? state + 1 : -1);
      next0.push(m === clue[j]! ? -2 : -1); // -2: the gap after this block, filled in below
    }
  }
  for (let s = 0; s < next0.length; s++) {
    if (next0[s] === -2) next0[s] = gap[gap.findIndex((g) => g > s)]!;
  }
  let accept = 1 << gap.at(-1)!;
  if (clue.length > 0) accept |= 1 << (gap.at(-1)! - 1); // the last block may end at the line's end

  const fwd = new Int32Array(length + 1);
  const bwd = new Int32Array(length + 1);
  const out = new Int8Array(length);
  const states = next0.length;
  return (line) => {
    fwd[0] = 1 << gap[0]!;
    for (let c = 0; c < length; c++) {
      let reach = 0;
      for (let s = 0; s < states; s++) {
        if (!(fwd[c]! & (1 << s))) continue;
        if (line[c] !== 1 && next0[s]! >= 0) reach |= 1 << next0[s]!;
        if (line[c] !== 0 && next1[s]! >= 0) reach |= 1 << next1[s]!;
      }
      fwd[c + 1] = reach;
    }
    bwd[length] = accept;
    for (let c = length - 1; c >= 0; c--) {
      let back = 0;
      for (let s = 0; s < states; s++) {
        const by0 = line[c] !== 1 && next0[s]! >= 0 && bwd[c + 1]! & (1 << next0[s]!);
        const by1 = line[c] !== 0 && next1[s]! >= 0 && bwd[c + 1]! & (1 << next1[s]!);
        if (by0 || by1) back |= 1 << s;
      }
      bwd[c] = back;
    }
    if (!(fwd[0]! & bwd[0]!)) return null;
    for (let c = 0; c < length; c++) {
      let can0 = false;
      let can1 = false;
      const live = fwd[c]! & bwd[c]!;
      for (let s = 0; s < states; s++) {
        if (!(live & (1 << s))) continue;
        if (line[c] !== 1 && next0[s]! >= 0 && bwd[c + 1]! & (1 << next0[s]!)) can0 = true;
        if (line[c] !== 0 && next1[s]! >= 0 && bwd[c + 1]! & (1 << next1[s]!)) can1 = true;
      }
      if (!can0 && !can1) return null;
      out[c] = can0 && can1 ? UNKNOWN : can1 ? 1 : 0;
    }
    return out;
  };
}

function intIn(value: unknown, min: number, max: number, field: string): number {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    throw new Error(`${field} out of range`);
  }
  return value as number;
}
