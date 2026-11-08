import { svg } from "lit-html";
import type { PuzzleType } from "../../core/types.ts";
import { problems, renderEditor } from "./editor.ts";
import type { KlotskiData, KlotskiMove, KlotskiState } from "./logic.ts";
import { renderPlay } from "./render.ts";
import { klotskiRules } from "./rules.ts";

export const klotski: PuzzleType<KlotskiData, KlotskiState, KlotskiMove> = {
  ...klotskiRules,
  name: "klotskiName",
  description: "klotskiDescription",
  // A tray with a big block on top, two small ones below and the opening at the bottom.
  icon: svg`<path d="M9 21H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-5"/><rect x="7" y="6" width="10" height="7" rx="1"/><path d="M7 17h3"/><path d="M14 17h3"/>`,
  color: { dark: "#D9AE7E", light: "#8A5A2B" },
  problems,
  themeParts: { board: "klPartBoard", line: "klPartLine", piece: "klPartPiece", accent: "klPartAccent", target: "klPartTarget" },
  renderPlay,
  renderEditor,
};
