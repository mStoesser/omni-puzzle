import { svg } from "lit-html";
import type { PuzzleType } from "../../core/types.ts";
import { problems, renderEditor } from "./editor.ts";
import type { RushHourData, RushHourMove, RushHourState } from "./logic.ts";
import { renderPlay } from "./render.ts";
import { rushHourRules } from "./rules.ts";

export const rushHour: PuzzleType<RushHourData, RushHourState, RushHourMove> = {
  ...rushHourRules,
  name: "rushHourName",
  description: "rushHourDescription",
  icon: svg`<path d="m21 8-2 2-1.5-3.7A2 2 0 0 0 15.646 5H8.4a2 2 0 0 0-1.903 1.257L5 10 3 8"/><path d="M7 14h.01"/><path d="M17 14h.01"/><rect width="18" height="8" x="3" y="10" rx="2"/><path d="M5 18v2"/><path d="M19 18v2"/>`,
  color: { dark: "#FF8A66", light: "#C2410C" },
  problems,
  themeParts: { board: "rhPartBoard", line: "rhPartLine", piece: "rhPartPiece", accent: "rhPartAccent", target: "rhPartTarget" },
  renderPlay,
  renderEditor,
};
