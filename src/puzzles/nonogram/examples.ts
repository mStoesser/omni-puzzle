import type { PuzzleDocument } from "../../core/types.ts";
import { fromImage } from "./logic.ts";
import type { NonogramData } from "./logic.ts";

// Original pixel pictures. Only their clues are part of the puzzle (validate drops the picture);
// examples.test.ts checks that each has exactly one solution.

function example(id: string, title: string, image: string[]) {
  const { image: _, ...data } = fromImage(image);
  const doc: PuzzleDocument<NonogramData> = {
    format: 1,
    type: "nonogram",
    typeVersion: 1,
    meta: { title, createdAt: "2026-11-04T00:00:00.000Z", verified: true },
    data,
  };
  return { id, doc };
}

export const nonogramExamples = [
  example("nonogram-1", "Herz", [
    ".#.#.", //
    "#####",
    "#####",
    ".###.",
    "..#..",
  ]),
  example("nonogram-2", "Häuschen", [
    "...##...", //
    "..####..",
    ".######.",
    "########",
    ".#....#.",
    ".#.##.#.",
    ".#.##.#.",
    ".######.",
  ]),
  example("nonogram-3", "Katze", [
    "#........#", //
    "##......##",
    "###....###",
    "##########",
    "#.##..##.#",
    "##########",
    "####..####",
    ".###..###.",
    "..######..",
    "...####...",
  ]),
  example("nonogram-4", "Segelboot", [
    ".......#.......", //
    ".......##......",
    ".......###.....",
    "......####.....",
    "......#####....",
    ".....######....",
    ".....#######...",
    "....########...",
    "....#########..",
    ".......#.......",
    "###############",
    ".#############.",
    "..###########..",
    "...#########...",
    "##..##..##..##.",
  ]),
];
