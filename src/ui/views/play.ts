import { html, nothing } from "lit-html";
import { canRedo, canUndo, moveCount } from "../../core/session.ts";
import { hrefWithMode } from "../../core/router.ts";
import { averageRating, formatAverage } from "../../core/reactions.ts";
import type { MyReaction } from "../../core/reactions.ts";
import type { AnyPlaySession } from "../../core/session.ts";
import type { PuzzleTheme } from "../../core/puzzle-theme.ts";
import type { ImageSource, PuzzleLang } from "../../core/types.ts";
import { parseResult } from "../../core/result.ts";
import type { PuzzleResult } from "../../core/result.ts";
import { formatDuration } from "../../core/timer.ts";
import type { Timer } from "../../core/timer.ts";
import { t, tn } from "../../i18n/t.ts";
import { leaderboardOutcome, leaderboardSection } from "../components/leaderboard.ts";
import type { LeaderboardActions, LeaderboardModel, LeaderboardViewer } from "../components/leaderboard.ts";
import { reportDialog } from "../components/report-dialog.ts";
import { shortcutsButton } from "../components/shortcuts-dialog.ts";
import type { ReportDialogActions, ReportDialogModel } from "../components/report-dialog.ts";
import { iconButton, popoverMenu, sheet, stat, typeVars } from "../components/ui.ts";
import type { MenuItem } from "../components/ui.ts";
import { icon } from "../icons.ts";
import { buttonShortcut } from "../keyboard.ts";
import { playStage } from "./play-stage.ts";

/** Where the puzzle comes from: built-in example, share link, published, own library, or test play from the editor. */
export type PlayOrigin = "example" | "shared" | "published" | "own" | "test";

/**
 * The hull around the stage (M40): what is shown besides the puzzle and what happens when it is solved.
 * "standard" = header, stats, side panel and the solved sheet; "full" = full screen (M41): only the board, a small bar
 * and a short note when solved; "escape" = escape mode (M42): like full screen without a way back, and the puzzle's
 * result when solved. It belongs to the play state, not to the puzzle.
 */
export type Presentation = "standard" | "full" | "escape";

export type PlayViewModel = {
  title: string;
  session: AnyPlaySession;
  showSolved: boolean;
  origin: PlayOrigin;
  presentation: Presentation;
  localId?: string; // library id for origin "own"
  published?: PublishedInfo; // for origin "published"
  backHref?: string; // where "back" leads; default depends on the origin
  progressKey: string | null; // null = test play (no progress)
  images: ImageSource; // local pictures, or those of the published puzzle
  minMoves: number | null; // shortest solution, if known
  lang?: PuzzleLang; // language of the puzzle's texts (M28); a remix keeps it
  theme?: PuzzleTheme; // colors of the board (M29); a remix keeps it
  description?: string; // the creator's description (M34, meta.description); published puzzles show theirs in `published`
  /**
   * M42: what solving reveals (meta.result), shown only in escape mode and test play. The hulls show whatever is here
   * once solved; a server that hands out the result only for a checked solution would fill it in at that moment.
   */
  result?: string;
  level?: { index: number; total: number }; // position among the examples of its type (1-based)
  next?: { href: string; title: string; label?: string }; // the following example or chain step; `label` replaces the button text
  chain?: { story: string }; // a step of a chain: the text before the puzzle
  /** Played as the puzzle of `day` (M26); `streak` (days in a row) is computed when rendering. */
  daily?: { day: string; streak?: number };
  levels?: readonly PlayLevel[]; // all examples of the type, shown beside the board on desktop
  timer: Timer; // play time of this attempt
  /** M38: the puzzle can be passed on (not in test play, own puzzles only once the creator solved them). */
  shareable?: boolean;
  /** M41: the browser can show the page in full screen and does not yet (computed when rendering). */
  canHideBrowserBars?: boolean;
};

/** Numbers beside the board: best results so far (null = not solved before) and the running time. */
/** `showTimer` (M34): the player's setting; false hides only the running time, the solved sheet still shows it. */
export type PlayStats = { bestMoves: number | null; bestTimeMs: number | null; timeMs: number; showTimer: boolean };

export type PlayLevel = { href: string; title: string; current: boolean; solved: boolean; minMoves: number | null };

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
  leaderboard: LeaderboardModel | null; // null = the type has no leaderboard
  /** Computed from the session when rendering, like `access`. */
  viewer?: LeaderboardViewer;
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
  openShortcuts(): void;
  openShare(): void;
  enterFull(): void;
  exitFull(): void;
  hideBrowserBars(): void;
  report: ReportDialogActions;
  leaderboard: LeaderboardActions;
};

const MENU_ID = "play-menu";

type PlayViewOptions = { embedded?: boolean };

/** The play view: the stage inside the hull chosen by `model.presentation`. */
export function playView(model: PlayViewModel, stats: PlayStats, actions: PlayViewActions, options: PlayViewOptions = {}) {
  switch (model.presentation) {
    case "standard":
      return standardHull(model, stats, actions, options);
    case "full":
      return fullHull(model, actions);
    case "escape":
      return escapeHull(model, actions);
  }
}

/**
 * Full screen (M41): the stage with a small bar (leave, hide the browser bars, undo, redo, restart) and no numbers.
 * When solved, a short note offers the next puzzle (in full screen too) or leaving; leaving shows the solved sheet.
 */
function fullHull(model: PlayViewModel, actions: PlayViewActions) {
  return html`<div class="play-full">
    ${fullBar(model, actions, true)}
    ${playStage(model, actions, { controls: false })}
    <div class="full-solved-region" role="status">${model.showSolved ? fullSolved(model, actions) : nothing}</div>
  </div>`;
}

/**
 * Escape mode (M42): full screen without "leave" (the back gesture cannot be blocked, but nobody leaves by mistake).
 * When solved, only the result: no next puzzle, no solved sheet (progress and leaderboard entries run as everywhere).
 */
function escapeHull(model: PlayViewModel, actions: PlayViewActions) {
  return html`<div class="play-full play-escape">
    ${fullBar(model, actions, false)}
    ${playStage(model, actions, { controls: false })}
    <div class="full-solved-region" role="status">${model.showSolved ? escapeSolved(parseResult(model.result)) : nothing}</div>
  </div>`;
}

function escapeSolved(result: PuzzleResult | null) {
  return html`<div class="full-solved escape-solved">
    <p class="full-solved-title">${icon("check", 22)}${t("solvedTitle")}</p>
    ${result ? html`<p class="escape-result-label">${t("escapeResult")}</p>${resultView(result)}` : nothing}
  </div>`;
}

/** A result as code (large), text or link (button with the visible domain; opens in a new tab). */
export function resultView(result: PuzzleResult) {
  switch (result.kind) {
    case "code":
      return html`<p class="escape-result escape-code">${result.text}</p>`;
    case "text":
      return html`<p class="escape-result escape-text">${result.text}</p>`;
    case "link":
      return html`<p class="escape-result escape-link">
        <a class="button" href=${result.url} target="_blank" rel="noopener noreferrer">${t("escapeResultOpen")}${icon("chevronRight", 18)}</a>
        <span class="escape-domain">${result.domain}</span>
      </p>`;
  }
}

/** The bar of the full screen hulls; `leave` = with the button that leaves (not in escape mode). */
function fullBar(model: PlayViewModel, actions: PlayViewActions, leave: boolean) {
  const { session } = model;
  const showUndo = session.type.controls?.undo !== false;
  return html`<nav class="full-bar" aria-label=${t("playControls")}>
      ${leave ? iconButton({ label: t("fullscreenLeave"), icon: "minimize", onClick: actions.exitFull, shortcut: buttonShortcut("fullscreen") }) : nothing}
      ${model.canHideBrowserBars ? iconButton({ label: t("fullscreenBrowser"), icon: "expand", onClick: actions.hideBrowserBars }) : nothing}
      <span class="full-bar-gap"></span>
      ${showUndo
        ? html`${iconButton({ label: t("undo"), icon: "undo", onClick: actions.undo, disabled: !canUndo(session), shortcut: buttonShortcut("undo") })}
          ${iconButton({ label: t("redo"), icon: "redo", onClick: actions.redo, disabled: !canRedo(session), shortcut: buttonShortcut("redo") })}`
        : nothing}
      ${iconButton({ label: t("restart"), icon: "restart", onClick: actions.restart, disabled: session.history.length === 1, shortcut: buttonShortcut("restart") })}
    </nav>`;
}

function fullSolved(model: PlayViewModel, actions: PlayViewActions) {
  return html`<div class="full-solved">
    <p class="full-solved-title">${icon("check", 22)}${t("solvedTitle")}</p>
    <div class="full-solved-actions">
      ${model.next
        ? html`<a class="button" href=${hrefWithMode(model.next.href, "full")}>${t("fullscreenNext")}${icon("chevronRight", 18)}</a>`
        : nothing}
      <button type="button" class=${model.next ? "secondary" : ""} @click=${actions.exitFull}>${t("fullscreenLeave")}</button>
    </div>
  </div>`;
}

/** `embedded`: inside the editor frame (test play), without the own header. */
function standardHull(model: PlayViewModel, stats: PlayStats, actions: PlayViewActions, options: PlayViewOptions) {
  const { session } = model;
  const { type } = session;
  const moves = moveCount(session);
  const showMoves = type.controls?.moves !== false;
  const best = stats.bestMoves;
  const menu = menuItems(model, actions);
  const level = model.level;
  const remixable = model.origin === "example" || model.origin === "shared" || model.origin === "published";
  return html`
    ${options.embedded ? nothing : html`<header class="play-head">
      ${model.origin === "test"
        ? iconButton({ label: t("backToEditor"), icon: "chevronLeft", onClick: actions.backToEditor })
        : iconButton({ label: t("back"), icon: "chevronLeft", href: model.backHref ?? (model.origin === "own" ? "#/library" : "#/") })}
      <div class="play-title typed" style=${typeVars(type)}>
        <span class="play-kicker"
          >${model.chain ? `${t("chainKicker")} · ` : nothing}${model.daily ? `${t("dailyKicker")} · ` : nothing}${t(type.name)}${level
            ? html` · <span class="level-short">${level.index} / ${level.total}</span
                ><span class="level-long">${t(model.chain ? "chainStepOf" : "playLevelOf", { index: level.index, total: level.total })}</span>`
            : nothing}</span
        >
        <h1 lang=${model.lang ?? nothing}>${model.title || t("untitled")}</h1>
      </div>
      ${menu.length > 0
        ? popoverMenu(MENU_ID, t("playMenu"), menu)
        : html`<span class="play-head-spacer"></span>`}
    </header>`}

    <div class="play-layout">
      ${playStage(model, actions)}
      <aside class="play-side" aria-label=${t("playInfo")}>
        ${showMoves
          ? html`<div class="stats play-stats ${stats.showTimer ? "four" : ""}">
              <span class="stats-live" aria-live="polite">${stat(t("moves"), moves)}</span> ${stat(t("playGoal"), model.minMoves ?? "–")}
              ${stat(t("playBest"), best ?? "–")} ${stats.showTimer ? stat(t("playTime"), formatDuration(stats.timeMs)) : nothing}
            </div>`
          : type.ranking === "time"
            ? html`<div class="stats play-stats ${stats.showTimer ? "two" : "one"}">
                ${stats.showTimer ? stat(t("playTime"), formatDuration(stats.timeMs)) : nothing}
                ${stat(t("playBestTime"), stats.bestTimeMs === null ? "–" : formatDuration(stats.bestTimeMs))}
              </div>`
            : nothing}
        ${model.description && !model.published
          ? html`<section class="box play-description" aria-labelledby="play-description">
              <h2 id="play-description" class="label">${t("playDescription")}</h2>
              <p lang=${model.lang ?? nothing}>${model.description}</p>
            </section>`
          : nothing}
        <section class="play-how">
          <h2 class="desktop-only">${t("playHow")}</h2>
          <p class="play-hint">${t(type.description)}</p>
        </section>
        ${model.published ? publishedInfo(model.published, best !== null || session.solved, actions) : nothing}
        ${model.published?.leaderboard ? leaderboardSection(model.published.leaderboard, model.published.viewer ?? "signed-out", actions.leaderboard) : nothing}
        ${model.levels ? levelBox(model.levels) : nothing}
        ${model.shareable
          ? html`<button class="secondary block play-share desktop-only" @click=${actions.openShare}>${icon("share", 18)}${t("share")}</button>`
          : nothing}
        ${model.origin === "test"
          ? nothing
          : html`<button class="secondary block play-fullscreen desktop-only" title="${t("fullscreen")} (F)" aria-keyshortcuts="F" @click=${actions.enterFull}>
              ${icon("maximize", 18)}${t("fullscreen")}
            </button>`}
        ${remixable
          ? html`<button class="secondary block play-remix desktop-only" @click=${actions.copyToLibrary}>
              ${icon("pencil", 18)}${t("playRemixTemplate")}
            </button>`
          : nothing}
        ${options.embedded ? nothing : shortcutsButton(actions.openShortcuts)}
      </aside>
    </div>

    ${model.showSolved ? solvedSheet(showMoves ? moves : null, model, stats, actions) : nothing}
    ${model.published?.report ? reportDialog(model.published.report, actions.report) : nothing}
  `;
}

function levelBox(levels: readonly PlayLevel[]) {
  return html`<section class="box play-levels desktop-only" aria-labelledby="play-levels">
    <h2 id="play-levels">${t("playMoreLevels")}</h2>
    <ul class="level-list">
      ${levels.map(
        (l) => html`<li>
          <a href=${l.href} class=${l.current ? "current" : ""} aria-current=${l.current ? "page" : nothing}>
            <span class="level-title">${l.title}</span>
            ${l.current
              ? html`<span class="level-status now">${t("playLevelNow")}</span>`
              : l.solved
                ? html`<span class="level-status ok">${t("solvedMark")}</span>`
                : l.minMoves !== null
                  ? html`<span class="level-status">${tn("homeLevelMoves", l.minMoves)}</span>`
                  : nothing}
          </a>
        </li>`,
      )}
    </ul>
  </section>`;
}

/** Share, remix (copy into the library), edit for own puzzles, report for published ones. */
function menuItems(model: PlayViewModel, actions: PlayViewActions): MenuItem[] {
  const items: MenuItem[] = [];
  if (model.origin !== "test") items.push({ icon: "maximize", text: t("fullscreen"), onClick: actions.enterFull });
  if (model.shareable) items.push({ icon: "share", text: t("share"), onClick: actions.openShare });
  if (model.origin === "example" || model.origin === "shared" || model.origin === "published") {
    items.push({ icon: "pencil", text: t("remix"), onClick: actions.copyToLibrary });
  }
  if (model.origin === "own") items.push({ icon: "pencil", text: t("edit"), href: `#/edit/${model.localId}` });
  const info = model.published;
  if (info?.access === "yes" && !info.me?.reported) items.push({ icon: "flag", text: t("report"), onClick: actions.openReport });
  return items;
}

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
    <span class="like-count" aria-label=${tn("likeCount", info.likeCount)}>${info.likeCount}</span>
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
        ? tn("ratingAverage", info.ratingCount, { average: formatAverage(average) })
        : info.ratingCount > 0
          ? t("ratingTooFew")
          : nothing}
    </p>
  </fieldset>`;
}

export function streakLine(days: number) {
  return html`<p class="daily-streak">${icon("flame", 18)}${tn("dailyStreak", days)}</p>`;
}

/** Test play (M42): the creator sees the result as players in escape mode will. */
function testResult(result: PuzzleResult | null) {
  return result
    ? html`<div class="box escape-test"><p class="escape-result-label">${t("escapeResultTest")}</p>${resultView(result)}</div>`
    : nothing;
}

function solvedSubline(moves: number | null, minMoves: number | null) {
  if (moves === null) return t("solvedText");
  if (minMoves !== null) return moves <= minMoves ? t("solvedOptimal") : t("solvedNotOptimal", { moves, min: minMoves });
  return tn("solvedMoves", moves);
}

/** `moves` null = the type does not count moves. */
function solvedSheet(moves: number | null, model: PlayViewModel, stats: PlayStats, actions: PlayViewActions) {
  const best = stats.bestMoves;
  const time = formatDuration(stats.timeMs);
  const test = model.origin === "test";
  const optimal = moves !== null && model.minMoves !== null && moves <= model.minMoves;
  const info = model.published;
  const primary = test
    ? // autofocus: the modal sheet would otherwise focus the first control, maybe the result's external link (M42)
      html`<button class="large block" autofocus @click=${actions.backToEditor}>${t("backToEditor")}</button>`
    : model.next
      ? html`<a class="button large block" href=${model.next.href}>${model.next.label ?? t("solvedNext", { title: model.next.title })}${icon("chevronRight", 18)}</a>`
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
      ${test ? testResult(parseResult(model.result)) : nothing}
      ${moves !== null
        ? html`<div class="stats ${test ? "" : "four"}">
            ${stat(t("solvedYourMoves"), moves, optimal ? "ok" : "")} ${stat(t("solvedMinimum"), model.minMoves ?? "–")}
            ${test ? nothing : html`${stat(t("playBest"), best ?? moves)} ${stat(t("solvedYourTime"), time)}`}
          </div>`
        : model.session.type.ranking === "time"
          ? html`<div class="stats two">
              ${stat(t("solvedYourTime"), time)}
              ${test ? nothing : stat(t("playBestTime"), formatDuration(Math.min(stats.bestTimeMs ?? stats.timeMs, stats.timeMs)))}
            </div>`
          : nothing}
      ${model.daily?.streak ? streakLine(model.daily.streak) : nothing}
      ${info?.leaderboard ? leaderboardOutcome(info.leaderboard, info.viewer ?? "signed-out", actions.leaderboard) : nothing}
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
