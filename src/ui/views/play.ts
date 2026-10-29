import { html, nothing } from "lit-html";
import { ref } from "lit-html/directives/ref.js";
import { canRedo, canUndo, currentState, moveCount } from "../../core/session.ts";
import type { AnyPlaySession } from "../../core/session.ts";
import { t } from "../../i18n/t.ts";

export type PlayViewModel = {
  title: string;
  session: AnyPlaySession;
  showSolved: boolean;
  /** "test" = test play from the editor; back leads to the editor instead of home. */
  mode: "play" | "test";
};

export type PlayViewActions = {
  dispatch(move: unknown): void;
  undo(): void;
  redo(): void;
  restart(): void;
  dismissSolved(): void;
  backToEditor(): void;
};

export function playView(model: PlayViewModel, actions: PlayViewActions) {
  const { session } = model;
  const moves = moveCount(session);
  return html`
    <header class="toolbar">
      ${model.mode === "test"
        ? html`<button class="secondary" @click=${actions.backToEditor} aria-label=${t("backToEditor")}>←</button>`
        : html`<a class="button secondary" href="#/" aria-label=${t("back")}>←</a>`}
      <h1 class="toolbar-title">${model.title}</h1>
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
    ${model.showSolved ? solvedDialog(moves, model.mode, actions) : nothing}
  `;
}

function solvedDialog(moves: number, mode: PlayViewModel["mode"], actions: PlayViewActions) {
  return html`
    <dialog class="dialog" ${ref(showModal)} @close=${actions.dismissSolved}>
      <h2>${t("solvedTitle")}</h2>
      <p>${moves === 1 ? t("solvedTextOne") : t("solvedTextOther", { moves })}</p>
      ${mode === "test" ? html`<p>${t("solvedVerified")}</p>` : nothing}
      <div class="dialog-actions">
        <button class="secondary" @click=${actions.dismissSolved}>${t("close")}</button>
        <button class="secondary" @click=${actions.restart}>${t("playAgain")}</button>
        ${mode === "test"
          ? html`<button @click=${actions.backToEditor}>${t("backToEditor")}</button>`
          : html`<a class="button" href="#/">${t("toHome")}</a>`}
      </div>
    </dialog>
  `;
}

// lit-html calls refs before a new template is inserted into the document; showModal needs it connected.
function showModal(element?: Element) {
  if (!(element instanceof HTMLDialogElement)) return;
  queueMicrotask(() => {
    if (element.isConnected && !element.open) element.showModal();
  });
}
