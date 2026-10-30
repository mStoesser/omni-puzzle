import type { PuzzleDocument } from "../../core/types.ts";
import type { LaserCell, LaserData, PlacedCell } from "./logic.ts";

// Original puzzles, generated with the solver: exactly one beam path solves each puzzle,
// and the start position differs from it by minMoves mirrors. minMoves is checked by examples.test.ts.

// Two characters per cell: " ." empty, "##" wall, " O" target, " >" emitter (also ^ v <),
// " /" or " \" fixed mirror, "*/" or "*\" rotatable mirror (start orientation).
function parseRows(rows: readonly string[]): LaserData {
  const cells: PlacedCell[] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x * 2 < row.length; x++) {
      const cell = parseCell(row.slice(x * 2, x * 2 + 2));
      if (cell) cells.push({ x, y, cell });
    }
  });
  return { width: rows[0]!.length / 2, height: rows.length, cells };
}

function parseCell(token: string): LaserCell | null {
  switch (token) {
    case " .":
      return null;
    case "##":
      return { kind: "wall" };
    case " O":
      return { kind: "target" };
    case " >":
      return { kind: "emitter", dir: "E" };
    case " <":
      return { kind: "emitter", dir: "W" };
    case " ^":
      return { kind: "emitter", dir: "N" };
    case " v":
      return { kind: "emitter", dir: "S" };
  }
  const orientation = token[1];
  if (orientation !== "/" && orientation !== "\\") throw new Error(`unknown token "${token}"`);
  return { kind: "mirror", orientation, rotatable: token[0] === "*" };
}

function example(id: string, title: string, minMoves: number, rows: readonly string[]) {
  const doc: PuzzleDocument<LaserData> = {
    format: 1,
    type: "laser",
    typeVersion: 1,
    meta: { title, createdAt: "2026-10-30T00:00:00.000Z", verified: true, minMoves },
    data: parseRows(rows),
  };
  return { id, doc };
}

export const laserExamples = [
  example("laser-1", "Erster Strahl", 2, [
    " . . . .##",
    " > . .*/ .",
    "*\\ . .*/ O",
    " . . . . .",
    " . . . .##",
  ]),
  example("laser-2", "Um die Ecke", 3, [
    " . . . .*\\ .",
    " . .*\\*/*\\ .",
    " > .*\\ O . .",
    " . . . . \\ .",
    "## . . .## .",
    " . . . O## .",
  ]),
  example("laser-3", "Spiegelkabinett", 4, [
    " . . O . . .*/",
    " .## . . . . .",
    " . .*\\ . . .*\\",
    " \\ . . .## .##",
    " .## O . . . .",
    " > .*\\ . . . .",
    " .*\\*\\ . \\ .*\\",
  ]),
  example("laser-4", "Lichtlabyrinth", 5, [
    " . . . . .##*\\",
    " . .*\\ . . .*/",
    "##*\\ . O . .*\\",
    " > O*\\ . . . .",
    " \\ O . . .*\\ /",
    " . .## . . . .",
    " . . .*\\## . .",
  ]),
];
