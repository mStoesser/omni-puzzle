import type { ExampleTitle, PuzzleDocument } from "../../core/types.ts";
import { fromImage } from "./logic.ts";
import type { NonogramData } from "./logic.ts";

// Original pixel pictures. Only their clues are part of the puzzle (validate drops the picture);
// examples.test.ts checks that each has exactly one solution.

function example(id: string, title: ExampleTitle, image: string[]) {
  const { image: _, ...data } = fromImage(image);
  const doc: PuzzleDocument<NonogramData> = {
    format: 1,
    type: "nonogram",
    typeVersion: 1,
    meta: { title: title.de, createdAt: "2026-11-04T00:00:00.000Z", verified: true },
    data,
  };
  return { id, doc, title };
}

export const nonogramExamples = [
  example("nonogram-1", { de: "Herz", en: "Heart" }, [
    ".#.#.", //
    "#####",
    "#####",
    ".###.",
    "..#..",
  ]),
  example("nonogram-2", { de: "Häuschen", en: "Little House" }, [
    "...##...", //
    "..####..",
    ".######.",
    "########",
    ".#....#.",
    ".#.##.#.",
    ".#.##.#.",
    ".######.",
  ]),
  example("nonogram-3", { de: "Katze", en: "Cat" }, [
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
  example("nonogram-4", { de: "Segelboot", en: "Sailboat" }, [
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
