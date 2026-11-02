import type { PuzzleType } from "../../core/types.ts";
import { problems, renderEditor } from "./editor.ts";
import type { RushHourData, RushHourMove, RushHourState } from "./logic.ts";
import { renderPlay } from "./render.ts";
import { rushHourRules } from "./rules.ts";

export const rushHour: PuzzleType<RushHourData, RushHourState, RushHourMove> = {
  ...rushHourRules,
  name: "rushHourName",
  description: "rushHourDescription",
  icon: "🚗",
  problems,
  renderPlay,
  renderEditor,
};
