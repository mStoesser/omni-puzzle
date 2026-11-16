import { html, nothing } from "lit-html";
import { canRedo, canUndo, currentState } from "../../core/session.ts";
import { t } from "../../i18n/t.ts";
import { icon } from "../icons.ts";
import type { IconName } from "../icons.ts";
import { buttonShortcut } from "../keyboard.ts";
import type { PlayViewActions, PlayViewModel } from "./play.ts";

/** What the stage needs from the play actions: moves and the history controls. */
export type StageActions = Pick<PlayViewActions, "dispatch" | "undo" | "redo" | "restart">;

/**
 * The stage (M40): the playable puzzle without anything around it – the chain story, the board and, unless a hull
 * brings its own, the control bar (undo, redo, restart). Hulls (the standard view, later full screen and escape mode)
 * put it into their layout and decide what else to show and what happens when the puzzle is solved.
 */
export function playStage(model: PlayViewModel, actions: StageActions, options: { controls?: boolean } = {}) {
  const { session } = model;
  const { type } = session;
  const showUndo = type.controls?.undo !== false;
  return html`<div class="play-stage">
    <div class="play-main">
      ${model.chain?.story ? html`<p class="box chain-story play-story">${model.chain.story}</p>` : nothing}
      <div class="board">
        ${type.renderPlay({ data: session.data, state: currentState(session), dispatch: actions.dispatch, images: model.images, theme: model.theme })}
      </div>
    </div>
    ${options.controls === false
      ? nothing
      : html`<nav class="play-controls ${showUndo ? "" : "single"}" aria-label=${t("playControls")}>
          ${showUndo
            ? html`
                ${control("undo", t("undo"), actions.undo, !canUndo(session), "undo")}
                ${control("redo", t("redo"), actions.redo, !canRedo(session), "redo")}
              `
            : nothing}
          ${control("restart", t("restart"), actions.restart, session.history.length === 1, "restart")}
        </nav>`}
  </div>`;
}

function control(name: IconName, text: string, onClick: () => void, disabled: boolean, shortcut: "undo" | "redo" | "restart") {
  const keys = buttonShortcut(shortcut);
  return html`<button class="play-control" title="${text} (${keys.hint})" aria-keyshortcuts=${keys.aria} ?disabled=${disabled} @click=${onClick}>
    ${icon(name, 22)}<span>${text}</span>
  </button>`;
}
