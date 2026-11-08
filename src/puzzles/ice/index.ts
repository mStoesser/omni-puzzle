import { svg } from "lit-html";
import type { PuzzleType } from "../../core/types.ts";
import { problems, renderEditor } from "./editor.ts";
import type { IceData, IceMove, IceState } from "./logic.ts";
import { renderPlay } from "./render.ts";
import { iceRules } from "./rules.ts";

export const ice: PuzzleType<IceData, IceState, IceMove> = {
  ...iceRules,
  name: "iceName",
  description: "iceDescription",
  // A figure sliding over the ground, with motion lines.
  icon: svg`<circle cx="16" cy="13" r="4"/><path d="M2 20h20"/><path d="M3 10h6"/><path d="M5 14h5"/>`,
  color: { dark: "#7DB4FF", light: "#2F62C8" },
  problems,
  themeParts: { board: "icePartBoard", line: "icePartLine", wall: "icePartWall", figure: "icePartFigure", accent: "icePartAccent", target: "icePartTarget", done: "icePartDone" },
  renderPlay,
  renderEditor,
};
