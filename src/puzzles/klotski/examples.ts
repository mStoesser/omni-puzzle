import type { Dir } from "../../core/grid.ts";
import type { ExampleTitle, PuzzleDocument } from "../../core/types.ts";
import type { Block, KlotskiData } from "./logic.ts";

// The first three are original puzzles, generated with the solver (random boards, picked by their minimal
// move count). The last one is the traditional Huarong Dao start. minMoves is checked by examples.test.ts.

type Spec = [x: number, y: number, w: number, h: number];

function example(id: string, title: ExampleTitle, minMoves: number, exit: { side: Dir; index: number }, target: Spec, others: Spec[]) {
  const toBlock = ([x, y, w, h]: Spec, i: number): Block => ({ id: `b${i}`, x, y, w, h });
  const data: KlotskiData = {
    width: 4,
    height: 5,
    blocks: [{ ...toBlock(target, 0), id: "t", target: true }, ...others.map((spec, i) => toBlock(spec, i + 1))],
    exit,
  };
  const doc: PuzzleDocument<KlotskiData> = {
    format: 1,
    type: "klotski",
    typeVersion: 1,
    meta: { title: title.de, createdAt: "2026-11-04T00:00:00.000Z", verified: true, minMoves },
    data,
  };
  return { id, doc, title };
}

export const klotskiExamples = [
  example("klotski-1", { de: "Erster Ausweg", en: "First Way Out" }, 5, { side: "S", index: 0 }, [0, 0, 2, 2], [
    [2, 0, 1, 1],
    [3, 0, 1, 1],
    [2, 1, 1, 1],
    [2, 2, 1, 1],
    [0, 2, 1, 1],
    [0, 3, 2, 1],
    [3, 1, 1, 1],
    [3, 3, 1, 1],
    [0, 4, 1, 1],
  ]),
  example("klotski-2", { de: "Rangierbahnhof", en: "Shunting Yard" }, 17, { side: "S", index: 1 }, [1, 0, 2, 2], [
    [2, 2, 1, 2],
    [1, 3, 1, 2],
    [3, 4, 1, 1],
    [0, 3, 1, 2],
    [3, 1, 1, 2],
    [0, 2, 2, 1],
    [0, 1, 1, 1],
  ]),
  example("klotski-3", { de: "Engpass", en: "Bottleneck" }, 37, { side: "S", index: 2 }, [0, 0, 2, 2], [
    [2, 2, 2, 1],
    [2, 4, 1, 1],
    [0, 2, 1, 2],
    [3, 3, 1, 2],
    [1, 2, 1, 2],
    [2, 1, 1, 1],
    [2, 3, 1, 1],
    [3, 0, 1, 1],
    [3, 1, 1, 1],
    [0, 4, 1, 1],
  ]),
  example("klotski-4", { de: "Huarong Dao (Klassiker)", en: "Huarong Dao (Classic)" }, 81, { side: "S", index: 1 }, [1, 0, 2, 2], [
    [0, 0, 1, 2],
    [3, 0, 1, 2],
    [0, 2, 1, 2],
    [3, 2, 1, 2],
    [1, 2, 2, 1],
    [1, 3, 1, 1],
    [2, 3, 1, 1],
    [0, 4, 1, 1],
    [3, 4, 1, 1],
  ]),
];
