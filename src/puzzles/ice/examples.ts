import type { PuzzleDocument } from "../../core/types.ts";
import type { IceCell, IceData } from "./logic.ts";

// Original puzzles, generated with the solver: random boards with exactly this minimal number of slides,
// picked for many reachable positions and dead ends. minMoves is checked by examples.test.ts.

// One character per cell: "." ice, "#" rock, ":" sand, "G" goal, "S" start.
const KINDS = { "#": "wall", ":": "sand", G: "goal", S: "start" } as const;

function parseRows(rows: readonly string[]): IceData {
  const cells: IceCell[] = [];
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === ".") return;
      const kind = KINDS[ch as keyof typeof KINDS];
      if (!kind) throw new Error(`unknown cell "${ch}"`);
      cells.push({ x, y, kind });
    }),
  );
  return { width: rows[0]!.length, height: rows.length, cells };
}

function example(id: string, title: string, minMoves: number, rows: readonly string[]) {
  const doc: PuzzleDocument<IceData> = {
    format: 1,
    type: "ice",
    typeVersion: 1,
    meta: { title, createdAt: "2026-11-03T00:00:00.000Z", verified: true, minMoves },
    data: parseRows(rows),
  };
  return { id, doc };
}

export const iceExamples = [
  example("ice-1", "Erste Schritte", 3, [
    "..#G..", //
    "..#...",
    "#...##",
    "......",
    "......",
    "..S...",
  ]),
  example("ice-2", "Glatteis", 5, [
    "..#...G", //
    ".###..#",
    "#....#.",
    ".......",
    ".......",
    "S..#.#.",
    "....#..",
  ]),
  example("ice-3", "Sandbank", 8, [
    ".:#.:...", //
    ".G......",
    "##.#.#..",
    ":....:.#",
    ".#.:.#S.",
    "#...##..",
    ".:......",
    "........",
  ]),
  example("ice-4", "Gletscherspalte", 12, [
    ".##S.....", //
    "#...#..:#",
    "#..#....#",
    "..##..:..",
    ".:#.....:",
    "......:..",
    "#...#....",
    "##G......",
    "......:#.",
  ]),
];
