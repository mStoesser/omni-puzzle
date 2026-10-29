import { createRegistry } from "../core/registry.ts";
import type { PuzzleDocument } from "../core/types.ts";
import { rushHour } from "./rushhour/index.ts";
import { rushHourExamples } from "./rushhour/examples.ts";

// Every puzzle type is registered here and nowhere else.
export const registry = createRegistry([rushHour]);

export type Example = { id: string; doc: PuzzleDocument };

/** Built-in puzzles, playable via #/play/<id>. */
export const examples: readonly Example[] = [...rushHourExamples];
