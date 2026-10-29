import { html } from "lit-html";
import type { PuzzleType } from "../../core/types.ts";
import { applyMove, createDefault, initState, isSolved, validate } from "./logic.ts";
import type { RushHourData, RushHourMove, RushHourState } from "./logic.ts";
import { renderPlay } from "./render.ts";
import { solve } from "./solver.ts";

export const rushHour: PuzzleType<RushHourData, RushHourState, RushHourMove> = {
  id: "rushhour",
  version: 1,
  name: "rushHourName",
  icon: "🚗",
  createDefault,
  validate,
  initState,
  applyMove,
  isSolved,
  solve,
  renderPlay,
  renderEditor: () => html``, // M3
};
