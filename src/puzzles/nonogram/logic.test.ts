import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analyze,
  applyMove,
  createDefault,
  findProblems,
  fromImage,
  initState,
  isSolved,
  lineDone,
  lineSolver,
  parseDraft,
  runs,
  validate,
} from "./logic.ts";
import type { NonogramData } from "./logic.ts";

test("runs lists the filled runs of a line", () => {
  const line = (s: string) => [...s].map((c) => c === "#");
  assert.deepEqual(runs(line("")), []);
  assert.deepEqual(runs(line("....")), []);
  assert.deepEqual(runs(line("##.#")), [2, 1]);
  assert.deepEqual(runs(line(".###.##")), [3, 2]);
});

test("fromImage computes the clues and keeps the picture", () => {
  const data = fromImage(["#.#", "###", "..#"]);
  assert.deepEqual(data.rows, [[1, 1], [3], [1]]);
  assert.deepEqual(data.cols, [[2], [1], [3]]);
  assert.deepEqual(data.image, ["#.#", "###", "..#"]);
});

// The line solver against trying every filling of the line.
function bruteLine(clue: number[], known: number[]): number[] | null {
  const n = known.length;
  const fits: number[][] = [];
  for (let mask = 0; mask < 2 ** n; mask++) {
    const cells = Array.from({ length: n }, (_, i) => (mask >> i) & 1);
    if (cells.some((v, i) => known[i] !== -1 && known[i] !== v)) continue;
    const r = runs(cells.map(Boolean));
    if (r.length === clue.length && r.every((v, i) => v === clue[i])) fits.push(cells);
  }
  if (fits.length === 0) return null;
  return Array.from({ length: n }, (_, i) => (fits.every((f) => f[i] === fits[0]![i]) ? fits[0]![i]! : -1));
}

test("lineSolver finds exactly the cells all placements agree on", () => {
  let seed = 3;
  const random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let round = 0; round < 400; round++) {
    const n = 1 + Math.floor(random() * 9);
    const picture = Array.from({ length: n }, () => random() < 0.5);
    const clue = random() < 0.85 ? runs(picture) : [1 + Math.floor(random() * n)];
    const known = Array.from({ length: n }, (_, i) => (random() < 0.3 ? (random() < 0.5 ? 1 : 0) : -1));
    const got = lineSolver(clue, n)(Int8Array.from(known));
    assert.deepEqual(got && [...got], bruteLine(clue, known), `clue ${clue} known ${known}`);
  }
});

test("lineSolver handles empty and full lines", () => {
  assert.deepEqual([...lineSolver([], 4)(Int8Array.from([-1, -1, -1, -1]))!], [0, 0, 0, 0]);
  assert.deepEqual([...lineSolver([4], 4)(Int8Array.from([-1, -1, -1, -1]))!], [1, 1, 1, 1]);
  assert.deepEqual([...lineSolver([3], 4)(Int8Array.from([-1, -1, -1, -1]))!], [-1, 1, 1, -1]);
  assert.equal(lineSolver([2], 4)(Int8Array.from([1, -1, -1, 1])), null);
});

/** All pictures that fit the clues (small boards only). */
function bruteSolutions(data: NonogramData): string[] {
  const n = data.width * data.height;
  const found: string[] = [];
  for (let mask = 0; mask < 2 ** n; mask++) {
    const cells = Array.from({ length: n }, (_, i) => ((mask >> i) & 1 ? "#" : ".")).join("");
    if (isSolved(data, { cells })) found.push(cells);
  }
  return found;
}

test("analyze agrees with brute force: unique, multiple or no solution", () => {
  let seed = 11;
  const random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const seen = { unique: 0, multiple: 0, none: 0 };
  for (let round = 0; round < 60; round++) {
    const w = 3 + Math.floor(random() * 2);
    const h = 3;
    const image = Array.from({ length: h }, () => Array.from({ length: w }, () => (random() < 0.5 ? "#" : ".")).join(""));
    const data = fromImage(image);
    // Sometimes change a clue, which often makes the puzzle unsolvable.
    if (random() < 0.25) data.rows[0] = data.rows[0]!.length ? [] : [1];
    const all = bruteSolutions(data);
    const result = analyze(data);
    if (all.length === 0) assert.equal(result.status, "none");
    else if (all.length === 1) assert.deepEqual(result, { status: "unique", solution: all[0], guessed: (result as { guessed: boolean }).guessed });
    else assert.equal(result.status, "multiple");
    if (result.status === "multiple") for (const s of result.solutions) assert.ok(all.includes(s));
    seen[all.length === 0 ? "none" : all.length === 1 ? "unique" : "multiple"]++;
  }
  assert.ok(seen.unique > 0 && seen.multiple > 0 && seen.none > 0, JSON.stringify(seen));
});

test("analyze reports when it needed to guess, and gives up at the limit", () => {
  // Pure line logic: a plus sign.
  const plus = analyze(createDefault());
  assert.equal(plus.status, "unique");
  assert.equal(plus.status === "unique" && plus.guessed, false);
  // Two diagonals are ambiguous; with no guesses allowed the analysis gives up.
  const diagonal = fromImage(["#..", ".#.", "..."]);
  assert.equal(analyze(diagonal).status, "multiple");
  assert.deepEqual(analyze(diagonal, 0), { status: "aborted" });
});

test("findProblems and validate: the clues must have exactly one solution", () => {
  assert.deepEqual(findProblems(createDefault()), []);
  assert.deepEqual(findProblems(fromImage(["#..", ".#.", "..."])), [{ code: "ambiguous" }]);
  const tooLong: NonogramData = { ...createDefault(), rows: [[3, 2], [], [], [], []] };
  assert.deepEqual(findProblems(tooLong), [{ code: "clue-too-long" }]);
  const mismatch: NonogramData = { ...createDefault(), rows: [[1], [1], [3], [1], []] };
  assert.deepEqual(findProblems(mismatch), [{ code: "count-mismatch" }]);
  // Row 0 needs two neighbouring cells, the columns want cells only in columns 0 and 2.
  const none: NonogramData = { width: 3, height: 3, rows: [[2], [], []], cols: [[1], [], [1]] };
  assert.deepEqual(findProblems(none), [{ code: "unsolvable" }]);
  assert.throws(() => validate(fromImage(["#..", ".#.", "..."])), /ambiguous/);
});

test("validate drops the editor picture, parseDraft keeps it", () => {
  const data = createDefault();
  assert.deepEqual(parseDraft(data), data);
  const { image: _, ...clues } = data;
  assert.deepEqual(validate(data), clues);
  assert.equal("image" in validate(data), false);
});

test("parseDraft rejects malformed data", () => {
  const ok = createDefault();
  const bad = [
    null,
    { ...ok, width: 2 },
    { ...ok, height: 16 },
    { ...ok, rows: ok.rows.slice(1) },
    { ...ok, cols: [[1], [1], [3], [1], "x"] },
    { ...ok, rows: [[0], [], [], [], []] },
    { ...ok, rows: [[6], [], [], [], []] },
    { ...ok, rows: [[1, 1, 1, 1], [], [], [], []] }, // more numbers than fit
    { ...ok, image: ["....."] },
    { ...ok, image: [".....", "..#..", ".#x#.", "..#..", "....."] },
  ];
  for (const raw of bad) assert.throws(() => parseDraft(raw), JSON.stringify(raw));
});

test("moves set cells; a move that changes nothing is invalid; the state is not mutated", () => {
  const data = createDefault();
  const start = initState(data);
  const filled = applyMove(data, start, { cells: [7, 11, 12, 13, 17], mark: "#" })!;
  assert.equal(start.cells, ".".repeat(25));
  assert.equal(isSolved(data, filled), true);
  assert.equal(applyMove(data, filled, { cells: [7], mark: "#" }), null);
  assert.equal(applyMove(data, start, { cells: [25], mark: "#" }), null);
  assert.equal(applyMove(data, start, { cells: [], mark: "#" }), null);
  assert.equal(applyMove(data, start, { cells: [1], mark: "?" as "#" }), null);
  const crossed = applyMove(data, start, { cells: [0, 1], mark: "x" })!;
  assert.equal(crossed.cells.slice(0, 3), "xx.");
  assert.equal(applyMove(data, crossed, { cells: [0], mark: "." })!.cells.slice(0, 3), ".x.");
});

test("crosses do not count as filled; lineDone checks one line", () => {
  const data = createDefault();
  const state = { cells: "xxxxx" + "..#.." + ".###." + "..#.." + "....." };
  assert.equal(isSolved(data, state), true);
  assert.equal(lineDone(data, state, "row", 2), true);
  assert.equal(lineDone(data, { cells: ".".repeat(25) }, "row", 2), false);
  assert.equal(lineDone(data, { cells: ".".repeat(25) }, "row", 0), true); // empty clue
});
