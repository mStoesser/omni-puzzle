import { createRegistry } from "../core/registry.ts";
import type { AnyPuzzleType, ExampleTitle, PuzzleDocument, PuzzleLang } from "../core/types.ts";
import { ice } from "./ice/index.ts";
import { iceExamples } from "./ice/examples.ts";
import { klotski } from "./klotski/index.ts";
import { klotskiExamples } from "./klotski/examples.ts";
import { lightsOut } from "./lightsout/index.ts";
import { lightsOutExamples } from "./lightsout/examples.ts";
import { laser } from "./laser/index.ts";
import { sokoban } from "./sokoban/index.ts";
import { sokobanExamples } from "./sokoban/examples.ts";
import { laserExamples } from "./laser/examples.ts";
import { nonogram } from "./nonogram/index.ts";
import { nonogramExamples } from "./nonogram/examples.ts";
import { pipes } from "./pipes/index.ts";
import { pipesExamples } from "./pipes/examples.ts";
import { quiz } from "./quiz/index.ts";
import { quizExamples } from "./quiz/examples.ts";
import { rushHour } from "./rushhour/index.ts";
import { rushHourExamples } from "./rushhour/examples.ts";

// Every puzzle type is registered here and nowhere else.
export const registry = createRegistry<AnyPuzzleType>([rushHour, laser, ice, sokoban, klotski, lightsOut, pipes, nonogram, quiz]);

/**
 * A built-in puzzle. `title`: its title in every language (puzzles without text); `lang`: the one language
 * of a puzzle written in it (the quiz), whose document then carries its own title.
 */
export type Example = { id: string; doc: PuzzleDocument; title?: ExampleTitle; lang?: PuzzleLang };

/** Built-in puzzles, playable via #/play/<id>. Titles in German; see examplesIn() for the app's language. */
export const examples: readonly Example[] = [...rushHourExamples, ...laserExamples, ...iceExamples, ...sokobanExamples, ...klotskiExamples, ...lightsOutExamples, ...pipesExamples, ...nonogramExamples, ...quizExamples];

const localized = new Map<PuzzleLang, readonly Example[]>();

/**
 * All examples with their titles in `lang`. `listed` leaves out those written in another language: they stay
 * playable by their link, but the home page and level lists show only examples a player can read.
 */
export function examplesIn(lang: PuzzleLang, which: "all" | "listed" = "listed"): readonly Example[] {
  let all = localized.get(lang);
  if (!all) {
    all = examples.map((e) => (e.title ? { ...e, doc: { ...e.doc, meta: { ...e.doc.meta, title: e.title[lang] } } } : e));
    localized.set(lang, all);
  }
  return which === "all" ? all : all.filter((e) => !e.lang || e.lang === lang);
}
