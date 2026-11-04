import type { PuzzleDocument } from "../../core/types.ts";
import type { LightsOutData } from "./logic.ts";

// Original puzzles, generated with the solver: random taps backwards on a given shape, picked for a target
// number of taps and many lights. minMoves is checked by examples.test.ts.
// "." light off, "*" light on, "#" hole.

function example(id: string, title: string, minMoves: number, rows: string[]) {
  const doc: PuzzleDocument<LightsOutData> = {
    format: 1,
    type: "lightsout",
    typeVersion: 1,
    meta: { title, createdAt: "2026-11-04T00:00:00.000Z", verified: true, minMoves },
    data: { rows },
  };
  return { id, doc };
}

export const lightsOutExamples = [
  example("lightsout-1", "Feierabend", 3, [
    "...*.", //
    ".****",
    "****.",
    ".**..",
    ".***.",
  ]),
  example("lightsout-2", "Kreuzung", 6, [
    "##**.##", //
    "##..*##",
    "*.*****",
    "**..**.",
    "*..***.",
    "##.**##",
    "##***##",
  ]),
  example("lightsout-3", "Innenhof", 10, [
    "******", //
    ".*****",
    ".*##.*",
    "..##.*",
    "*..*.*",
    "***..*",
  ]),
  example("lightsout-4", "Lichterkette", 14, [
    "..*.***", //
    "****.**",
    "*.*..**",
    ".******",
    "**...**",
    "***.***",
    ".***.*.",
  ]),
];
