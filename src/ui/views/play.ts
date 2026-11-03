import { html, nothing } from "lit-html";
import { canRedo, canUndo, currentState, moveCount } from "../../core/session.ts";
import { averageRating, formatAverage } from "../../core/reactions.ts";
import type { MyReaction } from "../../core/reactions.ts";
import type { AnyPlaySession } from "../../core/session.ts";
import type { ImageSource } from "../../core/types.ts";
import { t } from "../../i18n/t.ts";
import { reportDialog } from "../components/report-dialog.ts";
import type { ReportDialogActions, ReportDialogModel } from "../components/report-dialog.ts";
import { iconButton, sheet, stat, typeVars } from "../components/ui.ts";
import { icon } from "../icons.ts";
import type { IconName } from "../icons.ts";

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
  images: ImageSource; // local pictures, or those of the published puzzle
  minMoves: number | null; // shortest solution, if known
  level?: { index: number; total: number }; // position among the examples of its type (1-based)
  next?: { href: string; title: string }; // the following example
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
  report: ReportDialogModel | null; // open report dialog
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
  openReport(): void;
  report: ReportDialogActions;
};

const MENU_ID = "play-menu";

/** `best` = best result so far for this puzzle, if solved before. */
export function playView(model: PlayViewModel, best: number | null, actions: PlayViewActions) {
  const { session } = model;
  const { type } = session;
  const moves = moveCount(session);
  const showUndo = type.controls?.undo !== false;
  const showMoves = type.controls?.moves !== false;
  const menu = menuItems(model, actions);
  const kicker = model.level ? `${t(type.name)} · ${model.level.index} / ${model.level.total}` : t(type.name);
  return html`
    <header class="play-head">
      ${model.origin === "test"
        ? iconButton({ label: t("backToEditor"), icon: "chevronLeft", onClick: actions.backToEditor })
        : iconButton({ label: t("back"), icon: "chevronLeft", href: model.backHref ?? (model.origin === "own" ? "#/library" : "#/") })}
      <div class="play-title typed" style=${typeVars(type)}>
        <span class="play-kicker">${kicker}</span>
        <h1>${model.title || t("untitled")}</h1>
      </div>
      ${menu.length > 0
        ? html`<button class="icon-button" popovertarget=${MENU_ID} aria-label=${t("playMenu")} title=${t("playMenu")}>
              ${icon("more", 20)}
            </button>
            <div class="menu" id=${MENU_ID} popover role="menu" aria-label=${t("playMenu")}>
              ${menu.map((item) => menuItem(item))}
            </div>`
        : html`<span class="play-head-spacer"></span>`}
    </header>

    ${showMoves
      ? html`<div class="stats play-stats" aria-live="polite">
          ${stat(t("moves"), moves)} ${stat(t("playGoal"), model.minMoves ?? "–")} ${stat(t("playBest"), best ?? "–")}
        </div>`
      : nothing}

    <div class="play-main">
      <div class="board">
        ${type.renderPlay({ data: session.data, state: currentState(session), dispatch: actions.dispatch, images: model.images })}
      </div>
      <p class="play-hint">${t(type.description)}</p>
      ${model.published ? publishedInfo(model.published, best !== null || session.solved, actions) : nothing}
    </div>

    <nav class="play-controls ${showUndo ? "" : "single"}" aria-label=${t("playControls")}>
      ${showUndo
        ? html`
            ${control("undo", t("undo"), actions.undo, !canUndo(session))}
            ${control("redo", t("redo"), actions.redo, !canRedo(session))}
          `
        : nothing}
      ${control("restart", t("restart"), actions.restart, session.history.length === 1)}
    </nav>

    ${model.showSolved ? solvedSheet(showMoves ? moves : null, model, best, actions) : nothing}
    ${model.published?.report ? reportDialog(model.published.report, actions.report) : nothing}
  `;
}

function control(name: IconName, text: string, onClick: () => void, disabled: boolean) {
  return html`<button class="play-control" ?disabled=${disabled} @click=${onClick}>${icon(name, 22)}<span>${text}</span></button>`;
}

type MenuItem = { icon: IconName; text: string; href?: string; onClick?: () => void };

/** Remix (copy into the library), edit for own puzzles, report for published ones. */
function menuItems(model: PlayViewModel, actions: PlayViewActions): MenuItem[] {
  const items: MenuItem[] = [];
  if (model.origin === "example" || model.origin === "shared" || model.origin === "published") {
    items.push({ icon: "pencil", text: t("remix"), onClick: actions.copyToLibrary });
  }
  if (model.origin === "own") items.push({ icon: "pencil", text: t("edit"), href: `#/edit/${model.localId}` });
  const info = model.published;
  if (info?.access === "yes" && !info.me?.reported) items.push({ icon: "flag", text: t("report"), onClick: actions.openReport });
  return items;
}

function menuItem(item: MenuItem) {
  const close = (e: Event) => (e.currentTarget as Element).closest<HTMLElement>("[popover]")?.hidePopover();
  return item.href
    ? html`<a class="menu-item" role="menuitem" href=${item.href} @click=${close}>${icon(item.icon, 18)}${item.text}</a>`
    : html`<button
        class="menu-item"
        role="menuitem"
        @click=${(e: Event) => {
          close(e);
          item.onClick?.();
        }}
      >
        ${icon(item.icon, 18)}${item.text}
      </button>`;
}

/** `solved` = solved now or before: then the player may rate here too. */
function publishedInfo(info: PublishedInfo, solved: boolean, actions: PlayViewActions) {
  return html`<section class="published-info">
    ${info.hidden ? html`<p class="notice">${t("publishedHidden")}</p>` : nothing}
    <div class="published-row">
      <p class="published-author">${info.author === null ? t("publishedByUnknown") : t("publishedBy", { author: info.author })}</p>
      ${likeButton(info, actions)}
    </div>
    ${info.description ? html`<p class="published-description">${info.description}</p>` : nothing}
    ${access(info)}
    ${info.access === "yes" ? (solved ? rating(info, actions) : html`<p class="hint">${t("ratingAfterSolve")}</p>`) : nothing}
    ${info.me?.reported ? html`<p class="hint">${t("reportAlready")}</p>` : nothing}
  </section>`;
}

function likeButton(info: PublishedInfo, actions: PlayViewActions) {
  const liked = info.me?.liked === true;
  return html`<button
    class="secondary like-button"
    aria-pressed=${liked ? "true" : "false"}
    ?disabled=${info.access !== "yes" || info.busy}
    @click=${actions.toggleLike}
  >
    ${icon("heart", 18)} ${t("like")}
    <span class="like-count" aria-label=${t("likeCount", { count: info.likeCount })}>${info.likeCount}</span>
  </button>`;
}

function access(info: PublishedInfo) {
  return info.access === "signed-out"
    ? html`<p class="hint">${t("reactionsSignIn")} <a href="#/account">${t("accountLink")}</a></p>`
    : info.access === "own"
      ? html`<p class="hint">${t("reactionsOwn")}</p>`
      : nothing;
}

/** Own rating 1–5 and the average (only after solving). */
function rating(info: PublishedInfo, actions: PlayViewActions) {
  const { me } = info;
  const average = averageRating(info.ratingSum, info.ratingCount);
  return html`<fieldset class="rating" ?disabled=${info.busy}>
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
    <p class="hint">
      ${average !== null
        ? t("ratingAverage", { average: formatAverage(average), count: info.ratingCount })
        : info.ratingCount > 0
          ? t("ratingTooFew")
          : nothing}
    </p>
  </fieldset>`;
}

function solvedSubline(moves: number | null, minMoves: number | null) {
  if (moves === null) return t("solvedText");
  if (minMoves !== null) return moves <= minMoves ? t("solvedOptimal") : t("solvedNotOptimal", { moves, min: minMoves });
  return moves === 1 ? t("solvedTextOne") : t("solvedTextOther", { moves });
}

/** `moves` null = the type does not count moves. */
function solvedSheet(moves: number | null, model: PlayViewModel, best: number | null, actions: PlayViewActions) {
  const test = model.origin === "test";
  const optimal = moves !== null && model.minMoves !== null && moves <= model.minMoves;
  const info = model.published;
  const primary = test
    ? html`<button class="large block" @click=${actions.backToEditor}>${t("backToEditor")}</button>`
    : model.next
      ? html`<a class="button large block" href=${model.next.href}>${t("solvedNext", { title: model.next.title })}${icon("chevronRight", 18)}</a>`
      : model.origin === "own"
        ? html`<a class="button large block" href="#/library">${t("library")}</a>`
        : html`<a class="button large block" href=${model.backHref ?? "#/"}>${model.backHref ? t("solvedBackToGallery") : t("toHome")}</a>`;
  return sheet(
    "solved-title",
    actions.dismissSolved,
    html`<div class="solved">
      <span class="solved-icon">${icon("check", 32)}</span>
      <h2 id="solved-title" class="solved-title">${t("solvedTitle")}</h2>
      <p class="solved-sub">${solvedSubline(moves, model.minMoves)}</p>
      ${test ? html`<p class="solved-sub">${t("solvedVerified")}</p>` : nothing}
      ${moves !== null
        ? html`<div class="stats">
            ${stat(t("solvedYourMoves"), moves, optimal ? "ok" : "")} ${stat(t("solvedMinimum"), model.minMoves ?? "–")}
            ${test ? nothing : stat(t("playBest"), best ?? moves)}
          </div>`
        : nothing}
      ${info
        ? html`<div class="like-row box">
              <div>
                <p class="like-row-title">${t("solvedLikeQuestion")}</p>
                <p class="like-row-sub">${info.author === null ? t("publishedByUnknown") : t("publishedBy", { author: info.author })}</p>
              </div>
              ${likeButton(info, actions)}
            </div>
            ${access(info)} ${info.access === "yes" ? rating(info, actions) : nothing}`
        : nothing}
      ${primary}
      <div class="solved-secondary">
        <button class="secondary" @click=${actions.restart}>${icon("restart", 18)}${t("restart")}</button>
        ${model.origin === "example" || model.origin === "shared" || model.origin === "published"
          ? html`<button class="secondary" @click=${actions.copyToLibrary}>${icon("pencil", 18)}${t("remix")}</button>`
          : nothing}
      </div>
    </div>`,
    "solved-sheet",
  );
}
