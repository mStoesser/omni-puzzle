import { svg } from "lit-html";
import type { PuzzleType } from "../../core/types.ts";
import { problems, renderEditor } from "./editor.ts";
import type { SokobanData, SokobanMove, SokobanState } from "./logic.ts";
import { renderPlay } from "./render.ts";
import { sokobanRules } from "./rules.ts";

export const sokoban: PuzzleType<SokobanData, SokobanState, SokobanMove> = {
  ...sokobanRules,
  name: "sokobanName",
  description: "sokobanDescription",
  // A crate with a slat, pushed by an arrow.
  icon: svg`<rect x="10" y="7" width="11" height="11" rx="1.5"/><path d="M10 7l11 11"/><path d="M2 12.5h5"/><path d="m5 10 2.5 2.5L5 15"/><path d="M3 21h18"/>`,
  color: { dark: "#F48FB1", light: "#B83270" },
  problems,
  renderPlay,
  renderEditor,
};
