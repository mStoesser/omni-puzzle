import { html, nothing } from "lit-html";
import { ref } from "lit-html/directives/ref.js";
import { canRedo, canUndo, currentState, moveCount } from "../../core/session.ts";
import type { AnyPlaySession } from "../../core/session.ts";
import { t } from "../../i18n/t.ts";
import { showModal } from "../components/dialog.ts";

/** Where the puzzle comes from: built-in example, share link, own library, or test play from the editor. */
export type PlayOrigin = "example" | "shared" | "own" | "test";

export type PlayViewModel = {
  title: string;
  session: AnyPlaySession;
  showSolved: boolean;
  origin: PlayOrigin;
  localId?: string; // library id for origin "own"
  progressKey: string | null; // null = not computed yet, or test play (no progress)
};

export type PlayViewActions = {
  dispatch(move: unknown): void;
  undo(): void;
  redo(): void;
  restart(): void;
  dismissSolved(): void;
  backToEditor(): void;
  copyToLibrary(): void;
};

/** `best` = best result so far for this puzzle, if solved before. */
export function playView(model: PlayViewModel, best: number | null, actions: PlayViewActions) {
  const { session } = model;
  const moves = moveCount(session);
  return html`
    <header class="toolbar">
      ${model.origin === "test"
        ? html`<button class="secondary" @click=${actions.backToEditor} aria-label=${t("backToEditor")}>←</button>`
        : html`<a class="button secondary" href=${model.origin === "own" ? "#/library" : "#/"} aria-label=${t("back")}>←</a>`}
      <h1 class="toolbar-title">${model.title || t("untitled")}</h1>
    </header>
    <div class="board">
      ${session.type.renderPlay({ data: session.data, state: currentState(session), dispatch: actions.dispatch })}
    </div>
    <footer class="toolbar">
      <button class="secondary" @click=${actions.undo} ?disabled=${!canUndo(session)}>${t("undo")}</button>
      <button class="secondary" @click=${actions.redo} ?disabled=${!canRedo(session)}>${t("redo")}</button>
      <span class="move-counter" aria-live="polite">${t("moves")}: ${moves}</span>
      <button class="secondary" @click=${actions.restart} ?disabled=${session.history.length === 1}>
        ${t("restart")}
      </button>
    </footer>
    ${extras(model, actions)}
    ${model.showSolved ? solvedDialog(moves, model, best, actions) : nothing}
  `;
}

function extras(model: PlayViewModel, actions: PlayViewActions) {
  switch (model.origin) {
    case "example":
    case "shared":
      return html`<div class="play-extras">
        <button class="secondary" @click=${actions.copyToLibrary}>${t("copyToLibrary")}</button>
      </div>`;
    case "own":
      return html`<div class="play-extras">
        <a class="button secondary" href="#/edit/${model.localId}">${t("edit")}</a>
      </div>`;
    case "test":
      return nothing;
  }
}

function solvedDialog(moves: number, model: PlayViewModel, best: number | null, actions: PlayViewActions) {
  const test = model.origin === "test";
  return html`
    <dialog class="dialog" ${ref(showModal)} @close=${actions.dismissSolved}>
      <h2>${t("solvedTitle")}</h2>
      <p>${moves === 1 ? t("solvedTextOne") : t("solvedTextOther", { moves })}</p>
      ${test ? html`<p>${t("solvedVerified")}</p>` : nothing}
      ${!test && best !== null ? html`<p>${best === 1 ? t("bestMovesOne") : t("bestMoves", { moves: best })}</p>` : nothing}
      <div class="dialog-actions">
        <button class="secondary" @click=${actions.dismissSolved}>${t("close")}</button>
        <button class="secondary" @click=${actions.restart}>${t("playAgain")}</button>
        ${test
          ? html`<button @click=${actions.backToEditor}>${t("backToEditor")}</button>`
          : model.origin === "own"
            ? html`<a class="button" href="#/library">${t("library")}</a>`
            : html`<a class="button" href="#/">${t("toHome")}</a>`}
      </div>
    </dialog>
  `;
}
