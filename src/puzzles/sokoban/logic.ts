import { DELTA, DIRS, isDir } from "../../core/grid.ts";
import type { Dir, Point } from "../../core/grid.ts";

// Sokoban: the figure walks one cell per move and pushes a single box ahead of it.
// Solved when every box stands on a goal.
//
// The board is stored in the common XSB text format, one string per row:
//   "#" wall, " " floor, "." goal, "$" box, "*" box on goal, "@" figure, "+" figure on goal.

export type SokobanData = { rows: string[] };

/**
 * Cell indexes (y * width + x). Boxes keep their order through the game, so each box can be
 * animated as the same element; only the solver compares them as a set.
 */
export type SokobanState = { player: number; boxes: readonly number[] };

/** One step of the figure; pushing a box is a step too. */
export type SokobanMove = Dir;

export const LIMITS = { minSize: 3, maxSize: 20 } as const;

export const CHARS = "# .$*@+";

export type ProblemCode = "no-player" | "multiple-players" | "no-boxes" | "box-goal-count";

export type Problem = { code: ProblemCode; cell?: number };

export function createDefault(): SokobanData {
  // Up one step, then push the box left onto the goal: 2 steps.
  return {
    rows: [
      "#######", //
      "#     #",
      "# .$  #",
      "#   @ #",
      "#######",
    ],
  };
}

export function width(data: SokobanData): number {
  return data.rows[0]?.length ?? 0;
}

export function height(data: SokobanData): number {
  return data.rows.length;
}

/** The character at (x, y); outside the board counts as wall. */
export function charAt(data: SokobanData, x: number, y: number): string {
  return data.rows[y]?.[x] ?? "#";
}

const isBox = (ch: string) => ch === "$" || ch === "*";
const isGoal = (ch: string) => ch === "." || ch === "*" || ch === "+";
const isPlayer = (ch: string) => ch === "@" || ch === "+";

export function findProblems(data: SokobanData): Problem[] {
  const problems: Problem[] = [];
  const players: number[] = [];
  let boxes = 0;
  let goals = 0;
  data.rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (isPlayer(ch)) players.push(y * width(data) + x);
      if (isBox(ch)) boxes++;
      if (isGoal(ch)) goals++;
    }),
  );
  if (players.length === 0) problems.push({ code: "no-player" });
  if (players.length > 1) for (const cell of players) problems.push({ code: "multiple-players", cell });
  if (boxes === 0) problems.push({ code: "no-boxes" });
  else if (boxes !== goals) problems.push({ code: "box-goal-count" });
  return problems;
}

/** Validates untrusted data and returns a clean copy. Throws on any problem. */
export function validate(raw: unknown): SokobanData {
  const data = parseDraft(raw);
  const problems = findProblems(data);
  if (problems.length > 0) throw new Error(`invalid puzzle: ${problems.map((p) => p.code).join(", ")}`);
  return data;
}

/** Checks only the structure and returns a clean copy; editor drafts may still have problems. */
export function parseDraft(raw: unknown): SokobanData {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("data is not an object");
  const rows = (raw as Record<string, unknown>).rows;
  if (!Array.isArray(rows) || rows.length < LIMITS.minSize || rows.length > LIMITS.maxSize) throw new Error("height out of range");
  const w = typeof rows[0] === "string" ? rows[0].length : -1;
  if (w < LIMITS.minSize || w > LIMITS.maxSize) throw new Error("width out of range");
  for (const row of rows) {
    if (typeof row !== "string" || row.length !== w) throw new Error("rows must have equal length");
    for (const ch of row) if (!CHARS.includes(ch)) throw new Error("unknown cell");
  }
  return { rows: [...rows] as string[] };
}

export function initState(data: SokobanData): SokobanState {
  const w = width(data);
  let player = -1;
  const boxes: number[] = [];
  data.rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (isPlayer(ch) && player < 0) player = y * w + x;
      if (isBox(ch)) boxes.push(y * w + x);
    }),
  );
  return { player, boxes };
}

// --- Moves ---

/** Prepared lookup for fast repeated moves (solver, path finding). */
export type Board = { width: number; height: number; walls: Uint8Array; goals: Uint8Array };

export function prepare(data: SokobanData): Board {
  const w = width(data);
  const h = height(data);
  const walls = new Uint8Array(w * h);
  const goals = new Uint8Array(w * h);
  data.rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === "#") walls[y * w + x] = 1;
      if (isGoal(ch)) goals[y * w + x] = 1;
    }),
  );
  return { width: w, height: h, walls, goals };
}

/** The neighbouring cell index in a direction, or -1 outside the board. */
export function neighbour(board: Board, cell: number, dir: Dir): number {
  const [dx, dy] = DELTA[dir];
  const x = (cell % board.width) + dx;
  const y = Math.floor(cell / board.width) + dy;
  return x < 0 || y < 0 || x >= board.width || y >= board.height ? -1 : y * board.width + x;
}

/** One step on a prepared board; null if a wall, the edge or a blocked box is in the way. */
export function stepOn(board: Board, state: SokobanState, dir: Dir): SokobanState | null {
  const target = neighbour(board, state.player, dir);
  if (target < 0 || board.walls[target]) return null;
  const pushed = state.boxes.indexOf(target);
  if (pushed < 0) return { player: target, boxes: state.boxes };
  const beyond = neighbour(board, target, dir);
  if (beyond < 0 || board.walls[beyond] || state.boxes.includes(beyond)) return null;
  const boxes = state.boxes.map((b, i) => (i === pushed ? beyond : b));
  return { player: target, boxes };
}

export function applyMove(data: SokobanData, state: SokobanState, move: SokobanMove): SokobanState | null {
  if (!isDir(move) || state.player < 0) return null;
  return stepOn(prepare(data), state, move);
}

export function boxesOnGoals(board: Board, state: SokobanState): number {
  return state.boxes.filter((b) => board.goals[b]).length;
}

/** Solved when every box stands on a goal. */
export function isSolved(data: SokobanData, state: SokobanState): boolean {
  if (state.boxes.length === 0) return false;
  const board = prepare(data);
  return boxesOnGoals(board, state) === state.boxes.length;
}

/**
 * The shortest walk of the figure to `target` without pushing a box (breadth-first search),
 * as a list of steps; [] if it is already there, null if the cell cannot be reached.
 */
export function walkPath(data: SokobanData, state: SokobanState, target: Point): Dir[] | null {
  const board = prepare(data);
  if (target.x < 0 || target.y < 0 || target.x >= board.width || target.y >= board.height) return null;
  const goal = target.y * board.width + target.x;
  if (goal === state.player) return [];
  const blocked = (cell: number) => board.walls[cell] === 1 || state.boxes.includes(cell);
  if (blocked(goal)) return null;
  const from = new Map<number, { prev: number; dir: Dir }>();
  let frontier = [state.player];
  const seen = new Set(frontier);
  while (frontier.length > 0) {
    const next: number[] = [];
    for (const cell of frontier) {
      for (const dir of DIRS) {
        const n = neighbour(board, cell, dir);
        if (n < 0 || seen.has(n) || blocked(n)) continue;
        seen.add(n);
        from.set(n, { prev: cell, dir });
        if (n === goal) {
          const path: Dir[] = [];
          for (let c = goal; c !== state.player; c = from.get(c)!.prev) path.push(from.get(c)!.dir);
          return path.reverse();
        }
        next.push(n);
      }
    }
    frontier = next;
  }
  return null;
}

/** Cells the figure can reach from its start, ignoring boxes: the inside of the warehouse (drawn as floor). */
export function insideCells(data: SokobanData): Set<number> {
  const board = prepare(data);
  const start = initState(data).player;
  const inside = new Set<number>();
  if (start < 0) return inside;
  const stack = [start];
  inside.add(start);
  while (stack.length > 0) {
    const cell = stack.pop()!;
    for (const dir of DIRS) {
      const n = neighbour(board, cell, dir);
      if (n >= 0 && !board.walls[n] && !inside.has(n)) {
        inside.add(n);
        stack.push(n);
      }
    }
  }
  return inside;
}

/**
 * Cells a box may stand on without making the puzzle unsolvable for sure: those from which it could still be
 * pushed onto some goal. Computed by "pulling" boxes away from every goal. Everything else is a dead square
 * (e.g. a corner without a goal).
 */
export function liveCells(board: Board): Uint8Array {
  const live = new Uint8Array(board.walls.length);
  const stack: number[] = [];
  board.goals.forEach((g, i) => {
    if (g && !board.walls[i]) {
      live[i] = 1;
      stack.push(i);
    }
  });
  while (stack.length > 0) {
    const cell = stack.pop()!;
    for (const dir of DIRS) {
      // Pulling the box from `cell` to `back` needs the figure at `back` and room to step back behind it.
      const back = neighbour(board, cell, dir);
      const behind = back < 0 ? -1 : neighbour(board, back, dir);
      if (back < 0 || behind < 0 || board.walls[back] || board.walls[behind] || live[back]) continue;
      live[back] = 1;
      stack.push(back);
    }
  }
  return live;
}

/** Coordinates of a cell index. */
export function cellPoint(board: Board, cell: number): Point {
  return { x: cell % board.width, y: Math.floor(cell / board.width) };
}
