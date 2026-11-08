import { svg } from "lit-html";
import type { PuzzleType } from "../../core/types.ts";
import { problems, renderEditor } from "./editor.ts";
import type { LightsOutData, LightsOutMove, LightsOutState } from "./logic.ts";
import { renderPlay } from "./render.ts";
import { lightsOutRules } from "./rules.ts";

export const lightsOut: PuzzleType<LightsOutData, LightsOutState, LightsOutMove> = {
  ...lightsOutRules,
  name: "lightsOutName",
  description: "lightsOutDescription",
  // Five tiles in a plus: what one tap switches.
  icon: svg`<rect x="9.5" y="3.5" width="5" height="5" rx="1"/><rect x="3.5" y="9.5" width="5" height="5" rx="1"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><rect x="15.5" y="9.5" width="5" height="5" rx="1"/><rect x="9.5" y="15.5" width="5" height="5" rx="1"/>`,
  color: { dark: "#E08CF0", light: "#9C2BB0" },
  problems,
  themeParts: { board: "loPartBoard", line: "loPartLine", piece: "loPartPiece", done: "loPartDone" },
  renderPlay,
  renderEditor,
};
