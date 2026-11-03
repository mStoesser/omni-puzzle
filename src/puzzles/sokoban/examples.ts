import type { PuzzleDocument } from "../../core/types.ts";
import type { SokobanData } from "./logic.ts";

// Original puzzles, generated with the solver: random rooms whose minimal step count (within the server's
// search limit) lies in a target range, picked for many pushes. minMoves is checked by examples.test.ts.
// XSB format: "#" wall, " " floor, "." goal, "$" box, "*" box on goal, "@" figure, "+" figure on goal.

function example(id: string, title: string, minMoves: number, rows: string[]) {
  const doc: PuzzleDocument<SokobanData> = {
    format: 1,
    type: "sokoban",
    typeVersion: 1,
    meta: { title, createdAt: "2026-11-03T00:00:00.000Z", verified: true, minMoves },
    data: { rows },
  };
  return { id, doc };
}

export const sokobanExamples = [
  example("sokoban-1", "Erste Kiste", 12, [
    "#######", //
    "#.    #",
    "# $   #",
    "# #   #",
    "#@ # ##",
    "#######",
  ]),
  example("sokoban-2", "Zwei im Gang", 29, [
    "########", //
    "##     #",
    "#  ##  #",
    "# $$ ###",
    "#    . #",
    "#@#  .##",
    "########",
  ]),
  example("sokoban-3", "Lagerhalle", 42, [
    "#########", //
    "#     $.#",
    "#   #   #",
    "#      ##",
    "#.  $ $ #",
    "# # #. ##",
    "#@  #   #",
    "#########",
  ]),
  example("sokoban-4", "Hinterhof", 53, [
    "##########", //
    "#        #",
    "#    ##  #",
    "## . #   #",
    "##. ##  @#",
    "#     #$ #",
    "# #$    ##",
    "#   ##   #",
    "#        #",
    "##########",
  ]),
];
