import type { PuzzleDocument } from "../../core/types.ts";
import type { PipesData } from "./logic.ts";

// Original puzzles, generated with the solver: random networks grown from the source (some with an extra
// loop or fixed tiles), every tile turned randomly, picked for a target number of turns.
// minMoves is checked by examples.test.ts. One hex digit per cell: N = 1, E = 2, S = 4, W = 8.

function example(id: string, title: string, minMoves: number, source: { x: number; y: number }, fixed: number[], rows: string[]) {
  const doc: PuzzleDocument<PipesData> = {
    format: 1,
    type: "pipes",
    typeVersion: 1,
    meta: { title, createdAt: "2026-11-04T00:00:00.000Z", verified: true, minMoves },
    data: { rows, source, fixed },
  };
  return { id, doc };
}

export const pipesExamples = [
  example("pipes-1", "Wasserhahn", 10, { x: 0, y: 3 }, [], [
    "4200", //
    "57a1",
    "5ba1",
    "3e80",
  ]),
  example("pipes-2", "Gartenschlauch", 20, { x: 4, y: 1 }, [9, 23], [
    "83253", //
    "4f75d",
    "8e785",
    "04167",
    "00018",
  ]),
  example("pipes-3", "Ringleitung", 33, { x: 1, y: 4 }, [], [
    "042000", //
    "2d5621",
    "cfb64e",
    "b7e445",
    "29fed9",
    "238351",
  ]),
  example("pipes-4", "Kanalnetz", 58, { x: 5, y: 1 }, [5, 27, 31], [
    "4e34126", //
    "117bd65",
    "bdf7e73",
    "1a81ba8",
    "97cedb9",
    "a8aa33a",
    "116ce82",
  ]),
];
