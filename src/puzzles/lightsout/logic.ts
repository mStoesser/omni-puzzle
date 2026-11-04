import { DELTA, DIRS } from "../../core/grid.ts";

// Lights Out: tapping a cell toggles it and its (up to four) orthogonal neighbours. Solved when all lights are off.
//
// The board is stored as text, one string per row:
//   "." light off, "*" light on, "#" hole (no cell; allows irregular shapes).

export type LightsOutData = { rows: string[] };

/** Whether each cell's light is on, by cell index (y · width + x); holes are always false. */
export type LightsOutState = { on: readonly boolean[] };

/** Tap the cell (x, y). */
export type LightsOutMove = { x: number; y: number };

export const LIMITS = { minSize: 3, maxSize: 10 } as const;

export const CHARS = ".*#";

export type ProblemCode = "no-cells";

export type Problem = { code: ProblemCode };

export function createDefault(): LightsOutData {
  // One tap in the middle switches everything off.
  return { rows: [".....", "..*..", ".***.", "..*..", "....."] };
}

export function width(data: LightsOutData): number {
  return data.rows[0]?.length ?? 0;
}

export function height(data: LightsOutData): number {
  return data.rows.length;
}

/** The character at (x, y); outside the board counts as hole. */
export function charAt(data: LightsOutData, x: number, y: number): string {
  return data.rows[y]?.[x] ?? "#";
}

export function isCell(data: LightsOutData, x: number, y: number): boolean {
  return charAt(data, x, y) !== "#";
}

export function findProblems(data: LightsOutData): Problem[] {
  return data.rows.some((row) => /[.*]/.test(row)) ? [] : [{ code: "no-cells" }];
}

/** Validates untrusted data and returns a clean copy. Throws on any problem. */
export function validate(raw: unknown): LightsOutData {
  const data = parseDraft(raw);
  const problems = findProblems(data);
  if (problems.length > 0) throw new Error(`invalid puzzle: ${problems.map((p) => p.code).join(", ")}`);
  return data;
}

/** Checks only the structure and returns a clean copy; editor drafts may still have problems. */
export function parseDraft(raw: unknown): LightsOutData {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("data is not an object");
  const rows = (raw as Record<string, unknown>).rows;
  if (!Array.isArray(rows) || rows.length < LIMITS.minSize || rows.length > LIMITS.maxSize) throw new Error("rows");
  const w = typeof rows[0] === "string" ? rows[0].length : -1;
  if (w < LIMITS.minSize || w > LIMITS.maxSize) throw new Error("width");
  for (const row of rows) {
    if (typeof row !== "string" || row.length !== w) throw new Error("row length");
    for (const ch of row) if (!CHARS.includes(ch)) throw new Error("cell");
  }
  return { rows: [...rows] as string[] };
}

export function initState(data: LightsOutData): LightsOutState {
  return { on: data.rows.flatMap((row) => [...row].map((ch) => ch === "*")) };
}

/** Cell indexes a tap at (x, y) toggles: the cell and its neighbours, without holes. */
export function toggled(data: LightsOutData, x: number, y: number): number[] {
  const w = width(data);
  const cells = [y * w + x];
  for (const dir of DIRS) {
    const [dx, dy] = DELTA[dir];
    if (isCell(data, x + dx, y + dy)) cells.push((y + dy) * w + x + dx);
  }
  return cells;
}

export function applyMove(data: LightsOutData, state: LightsOutState, move: LightsOutMove): LightsOutState | null {
  const { x, y } = move;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= width(data) || y >= height(data)) return null;
  if (!isCell(data, x, y)) return null;
  const on = [...state.on];
  for (const cell of toggled(data, x, y)) on[cell] = !on[cell];
  return { on };
}

export function isSolved(_data: LightsOutData, state: LightsOutState): boolean {
  return !state.on.includes(true);
}

/** Number of lights that are on. */
export function lightsOn(state: LightsOutState): number {
  return state.on.filter(Boolean).length;
}
