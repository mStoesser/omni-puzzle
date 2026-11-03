import { createRegistry } from "../core/registry.ts";
import type { AnyPuzzleType, PuzzleDocument } from "../core/types.ts";
import { ice } from "./ice/index.ts";
import { iceExamples } from "./ice/examples.ts";
import { laser } from "./laser/index.ts";
import { laserExamples } from "./laser/examples.ts";
import { quiz } from "./quiz/index.ts";
import { quizExamples } from "./quiz/examples.ts";
import { rushHour } from "./rushhour/index.ts";
import { rushHourExamples } from "./rushhour/examples.ts";

// Every puzzle type is registered here and nowhere else.
export const registry = createRegistry<AnyPuzzleType>([rushHour, laser, ice, quiz]);

export type Example = { id: string; doc: PuzzleDocument };

/** Built-in puzzles, playable via #/play/<id>. */
export const examples: readonly Example[] = [...rushHourExamples, ...laserExamples, ...iceExamples, ...quizExamples];
