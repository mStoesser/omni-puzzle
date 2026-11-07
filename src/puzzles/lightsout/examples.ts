import type { ExampleTitle, PuzzleDocument } from "../../core/types.ts";
import type { LightsOutData } from "./logic.ts";

// Original puzzles, generated with the solver: random taps backwards on a given shape, picked for a target
// number of taps and many lights. minMoves is checked by examples.test.ts.
// "." light off, "*" light on, "#" hole.

function example(id: string, title: ExampleTitle, minMoves: number, rows: string[]) {
  const doc: PuzzleDocument<LightsOutData> = {
    format: 1,
    type: "lightsout",
    typeVersion: 1,
    meta: { title: title.de, createdAt: "2026-11-04T00:00:00.000Z", verified: true, minMoves },
    data: { rows },
  };
  return { id, doc, title };
}

export const lightsOutExamples = [
  example("lightsout-1", { de: "Feierabend", en: "Closing Time" }, 3, [
    "...*.", //
    ".****",
    "****.",
    ".**..",
    ".***.",
  ]),
  example("lightsout-2", { de: "Kreuzung", en: "Crossroads" }, 6, [
    "##**.##", //
    "##..*##",
    "*.*****",
    "**..**.",
    "*..***.",
    "##.**##",
    "##***##",
  ]),
  example("lightsout-3", { de: "Innenhof", en: "Courtyard" }, 10, [
    "******", //
    ".*****",
    ".*##.*",
    "..##.*",
    "*..*.*",
    "***..*",
  ]),
  example("lightsout-4", { de: "Lichterkette", en: "String of Lights" }, 14, [
    "..*.***", //
    "****.**",
    "*.*..**",
    ".******",
    "**...**",
    "***.***",
    ".***.*.",
  ]),
];
