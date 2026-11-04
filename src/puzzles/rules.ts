import { createRegistry } from "../core/registry.ts";
import type { AnyPuzzleRules } from "../core/types.ts";
import { iceRules } from "./ice/rules.ts";
import { klotskiRules } from "./klotski/rules.ts";
import { laserRules } from "./laser/rules.ts";
import { lightsOutRules } from "./lightsout/rules.ts";
import { sokobanRules } from "./sokoban/rules.ts";
import { quizRules } from "./quiz/rules.ts";
import { rushHourRules } from "./rushhour/rules.ts";

// The rules of every puzzle type, without UI: used by the publish function on the server.
// Each type registered in index.ts must be listed here too (checked by rules.test.ts).
export const rulesRegistry = createRegistry<AnyPuzzleRules>([rushHourRules, laserRules, iceRules, sokobanRules, klotskiRules, lightsOutRules, quizRules]);
