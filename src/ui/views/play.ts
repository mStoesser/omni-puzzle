import { html, nothing } from "lit-html";
import { ref } from "lit-html/directives/ref.js";
import { canRedo, canUndo, currentState, moveCount } from "../../core/session.ts";
import { averageRating, formatAverage } from "../../core/reactions.ts";
import type { MyReaction } from "../../core/reactions.ts";
import type { AnyPlaySession } from "../../core/session.ts";
import { t } from "../../i18n/t.ts";
import { showModal } from "../components/dialog.ts";

/** Where the puzzle comes from: built-in example, share link, published, own library, or test play from the editor. */
export type PlayOrigin = "example" | "shared" | "published" | "own" | "test";

export type PlayViewModel = {
  title: string;
  session: AnyPlaySession;
  showSolved: boolean;
  origin: PlayOrigin;
  localId?: string; // library id for origin "own"
  published?: PublishedInfo; // for origin "published"
  backHref?: string; // where "back" leads; default depends on the origin
  progressKey: string | null; // null = test play (no progress)
};

/** A published puzzle's details and the player's reactions. */
export type PublishedInfo = {
  id: string;
  author: string | null; // null = deleted account
  authorId: string;
  description: string;
  hidden: boolean;
  likeCount: number;
  ratingSum: number;
  ratingCount: number;
  me: MyReaction | null; // null = signed out or not loaded yet
  /** Whether the player may like and rate; computed from the session when rendering. */
  access?: "yes" | "loading" | "signed-out" | "own" | "hidden";
  busy: boolean;
};

export type PlayViewActions = {
  dispatch(move: unknown): void;
  undo(): void;
  redo(): void;
  restart(): void;
  dismissSolved(): void;
  backToEditor(): void;
  copyToLibrary(): void;
  toggleLike(): void;
  rate(value: number): void;
};

/** `best` = best result so far for this puzzle, if solved before. */
export function playView(model: PlayViewModel, best: number | null, actions: PlayViewActions) {
  const { session } = model;
  const moves = moveCount(session);
  const showUndo = session.type.controls?.undo !== false;
  const showMoves = session.type.controls?.moves !== false;
  return html`
    <header class="toolbar">
      ${model.origin === "test"
        ? html`<button class="secondary" @click=${actions.backToEditor} aria-label=${t("backToEditor")}>←</button>`
        : html`<a class="button secondary" href=${model.backHref ?? (model.origin === "own" ? "#/library" : "#/")} aria-label=${t("back")}>←</a>`}
      <h1 class="toolbar-title">${model.title || t("untitled")}</h1>
    </header>
    ${model.published ? publishedInfo(model.published) : nothing}
    <div class="board">
      ${session.type.renderPlay({ data: session.data, state: currentState(session), dispatch: actions.dispatch })}
    </div>
    <footer class="toolbar">
      ${showUndo
        ? html`
            <button class="secondary" @click=${actions.undo} ?disabled=${!canUndo(session)}>${t("undo")}</button>
            <button class="secondary" @click=${actions.redo} ?disabled=${!canRedo(session)}>${t("redo")}</button>
          `
        : nothing}
      <span class="move-counter" aria-live="polite">${showMoves ? `${t("moves")}: ${moves}` : ""}</span>
      <button class="secondary" @click=${actions.restart} ?disabled=${session.history.length === 1}>
        ${t("restart")}
      </button>
    </footer>
    ${model.published ? reactions(model.published, best !== null || session.solved, actions) : nothing}
    ${extras(model, actions)}
    ${model.showSolved ? solvedDialog(showMoves ? moves : null, model, best, actions) : nothing}
  `;
}

function extras(model: PlayViewModel, actions: PlayViewActions) {
  switch (model.origin) {
    case "example":
    case "shared":
    case "published":
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

/** Like button, average rating and the own rating (only after solving). */
function reactions(info: PublishedInfo, solved: boolean, actions: PlayViewActions) {
  const { access = "loading", me } = info;
  const average = averageRating(info.ratingSum, info.ratingCount);
  const liked = me?.liked === true;
  return html`<section class="reactions">
    <div class="reaction-row">
      <button
        class="secondary like-button"
        aria-pressed=${liked ? "true" : "false"}
        ?disabled=${access !== "yes" || info.busy}
        @click=${actions.toggleLike}
      >
        <span aria-hidden="true">${liked ? "♥" : "♡"}</span> ${t("like")}
        <span class="like-count" aria-label=${t("likeCount", { count: info.likeCount })}>${info.likeCount}</span>
      </button>
      <span class="hint">
        ${average !== null
          ? t("ratingAverage", { average: formatAverage(average), count: info.ratingCount })
          : info.ratingCount > 0
            ? t("ratingTooFew")
            : nothing}
      </span>
    </div>
    ${access === "signed-out"
      ? html`<p class="hint">${t("reactionsSignIn")} <a href="#/account">${t("accountLink")}</a></p>`
      : access === "own"
        ? html`<p class="hint">${t("reactionsOwn")}</p>`
        : nothing}
    ${access !== "yes"
      ? nothing
      : solved
        ? html`<fieldset class="rating" ?disabled=${info.busy}>
            <legend>${t("ratingQuestion")}</legend>
            <div class="rating-scale">
              <span class="hint" aria-hidden="true">${t("ratingEasy")}</span>
              ${[1, 2, 3, 4, 5].map(
                (value) => html`<button
                  class=${me?.rating === value ? "" : "secondary"}
                  aria-pressed=${me?.rating === value ? "true" : "false"}
                  aria-label=${t("ratingValue", { value })}
                  @click=${() => actions.rate(value)}
                >
                  ${value}
                </button>`,
              )}
              <span class="hint" aria-hidden="true">${t("ratingHard")}</span>
            </div>
          </fieldset>`
        : html`<p class="hint">${t("ratingAfterSolve")}</p>`}
  </section>`;
}

function publishedInfo(info: PublishedInfo) {
  return html`<div class="published-info">
    <p class="hint">${info.author === null ? t("publishedByUnknown") : t("publishedBy", { author: info.author })}</p>
    ${info.hidden ? html`<p class="notice">${t("publishedHidden")}</p>` : nothing}
    ${info.description ? html`<p class="published-description">${info.description}</p>` : nothing}
  </div>`;
}

/** `moves` null = the type does not count moves. */
function solvedDialog(moves: number | null, model: PlayViewModel, best: number | null, actions: PlayViewActions) {
  const test = model.origin === "test";
  return html`
    <dialog class="dialog" ${ref(showModal)} @close=${actions.dismissSolved}>
      <h2>${t("solvedTitle")}</h2>
      <p>${moves === null ? t("solvedText") : moves === 1 ? t("solvedTextOne") : t("solvedTextOther", { moves })}</p>
      ${test ? html`<p>${t("solvedVerified")}</p>` : nothing}
      ${!test && moves !== null && best !== null ? html`<p>${best === 1 ? t("bestMovesOne") : t("bestMoves", { moves: best })}</p>` : nothing}
      ${model.published ? reactions(model.published, true, actions) : nothing}
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
