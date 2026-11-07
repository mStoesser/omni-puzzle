import type { ExampleTitle, PuzzleDocument } from "../../core/types.ts";
import type { Dir } from "../../core/grid.ts";
import { minVersion } from "./logic.ts";
import type { Color, LaserCell, LaserData, PlacedCell } from "./logic.ts";

// Original puzzles, generated with the solver: exactly one beam path solves each puzzle,
// and the start position differs from it by minMoves mirrors. minMoves is checked by examples.test.ts.

// Two characters per cell: " ." empty, "##" wall, " O" target, " >" emitter (also ^ v <),
// " /" or " \" fixed mirror, "*/" or "*\" rotatable mirror (start orientation),
// "=/" fixed and "%/" rotatable splitter, and with colors (r, g, b): "gO" target, "g>" laser, "gF" filter.
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

const COLOR: Record<string, Color> = { r: "red", g: "green", b: "blue" };
const ARROW: Record<string, Dir> = { ">": "E", "<": "W", "^": "N", v: "S" };

function parseCell(token: string): LaserCell | null {
  const color = COLOR[token[0]!];
  if (color) {
    if (token[1] === "O") return { kind: "target", color };
    if (token[1] === "F") return { kind: "filter", color };
    const dir = ARROW[token[1]!];
    if (dir) return color === "red" ? { kind: "emitter", dir } : { kind: "emitter", dir, color };
    throw new Error(`unknown token "${token}"`);
  }
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
  if (token[0] === "=" || token[0] === "%") return { kind: "splitter", orientation, rotatable: token[0] === "%" };
  return { kind: "mirror", orientation, rotatable: token[0] === "*" };
}

function example(id: string, title: ExampleTitle, minMoves: number, rows: readonly string[], inventory?: number) {
  const data = parseRows(rows);
  if (inventory) data.inventory = inventory;
  const doc: PuzzleDocument<LaserData> = {
    format: 1,
    type: "laser",
    typeVersion: minVersion(data),
    meta: { title: title.de, createdAt: inventory || minVersion(data) > 1 ? "2026-11-06T00:00:00.000Z" : "2026-10-30T00:00:00.000Z", verified: true, minMoves },
    data,
  };
  return { id, doc, title };
}

export const laserExamples = [
  example("laser-1", { de: "Erster Strahl", en: "First Beam" }, 2, [
    " . . . .##",
    " > . .*/ .",
    "*\\ . .*/ O",
    " . . . . .",
    " . . . .##",
  ]),
  example("laser-2", { de: "Um die Ecke", en: "Around the Corner" }, 3, [
    " . . . .*\\ .",
    " . .*\\*/*\\ .",
    " > .*\\ O . .",
    " . . . . \\ .",
    "## . . .## .",
    " . . . O## .",
  ]),
  example("laser-3", { de: "Spiegelkabinett", en: "Hall of Mirrors" }, 4, [
    " . . O . . .*/",
    " .## . . . . .",
    " . .*\\ . . .*\\",
    " \\ . . .## .##",
    " .## O . . . .",
    " > .*\\ . . . .",
    " .*\\*\\ . \\ .*\\",
  ]),
  example("laser-4", { de: "Lichtlabyrinth", en: "Light Maze" }, 5, [
    " . . . . .##*\\",
    " . .*\\ . . .*/",
    "##*\\ . O . .*\\",
    " > O*\\ . . . .",
    " \\ O . . .*\\ /",
    " . .## . . . .",
    " . . .*\\## . .",
  ]),
  // M23 extensions, one example each: mirrors to place, beam splitters, colors.
  example(
    "laser-5",
    { de: "Selbst gesetzt", en: "Place Your Own" },
    6,
    [
      "*\\ . \\ . . . .",
      " . . . .## . .",
      " O / .*\\ . . .",
      " .## . . O . .",
      " . . . . . . .",
      " .*/ .## . .*\\",
      " . ^ . .## . .",
    ],
    2,
  ),
  example("laser-6", { de: "Geteiltes Licht", en: "Split Light" }, 6, [
    " . . . . O . .",
    " . \\ .*/%\\ O .",
    " .## . . / . .",
    " .## . O##%\\ .",
    " >*/*\\*\\ . . .",
    " .*/*\\ . . . .",
    " . . . . . . .",
  ]),
  example("laser-7", { de: "Farbenspiel", en: "Play of Colors" }, 6, [
    " . . .gv . . .",
    "rO .=\\*/*/## .",
    " . .*/ .gO*/ .",
    " .#### O .*/ <",
    " . . . .*/ / .",
    " .##gF . . / .",
    " . . .rF . . .",
  ]),
];
