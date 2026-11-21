import { html, nothing, svg } from "lit-html";
import { canRedo, canUndo } from "../../core/session.ts";
import type { AnyPlaySession } from "../../core/session.ts";
import { parseResult } from "../../core/result.ts";
import { formatDuration, IDLE_TIMER } from "../../core/timer.ts";
import type { ImageSource } from "../../core/types.ts";
import { activeSpots } from "../../rooms/logic.ts";
import type { EscapeRoomData, ImageRef, Opening, Scene } from "../../rooms/logic.ts";
import type { RoomSave } from "../../rooms/save.ts";
import { t, tn } from "../../i18n/t.ts";
import { iconButton, sheet } from "../components/ui.ts";
import { reportDialog } from "../components/report-dialog.ts";
import type { ReportDialogActions, ReportDialogModel } from "../components/report-dialog.ts";
import { timeAgo } from "../time.ts";
import { guarded, markPress } from "../components/press-guard.ts";
import { icon } from "../icons.ts";
import { drawnPicture, ROOM_VIEWBOX } from "../room-images.ts";
import { playStage } from "./play-stage.ts";
import { resultView } from "./play.ts";
import type { PlayViewModel } from "./play.ts";

/** The puzzle being played inside the room; `alreadySolved` = opened again after solving (shows the result first). */
export type RoomPuzzle = { id: string; session: AnyPlaySession; result?: string; alreadySolved: boolean };

export type RoomViewModel = {
  title: string;
  data: EscapeRoomData;
  save: RoomSave;
  /** A lock's input or a view, open over the room. Puzzles are in `puzzle`. */
  open: Exclude<Opening, { kind: "puzzle" }> | null;
  puzzle: RoomPuzzle | null;
  lock: { input: string; wrong: boolean };
  hintsOpen: boolean;
  sceneText: boolean; // the text of the scene just entered is shown
  spotsVisible: boolean; // "show areas" lights them up for a moment
  elapsedMs: number;
  canHideBrowserBars: boolean;
  images: ImageSource; // own pictures (image keys)
  backHref: string;
  /** Test play from the editor (M45): "back to the editor" instead of leaving, nothing is saved. */
  test: boolean;
  /** M46: about a published room (or one from a share link: no plays, no reports); null for own rooms and examples. */
  info: RoomInfo | null;
  infoOpen: boolean;
  report: ReportDialogModel | null;
  /** M47: the round being played together; null when playing alone. */
  group: RoomGroupView | null;
  /** M47: starting a round (published rooms, not in a round); null = not offered here. */
  groupStart: { access: "yes" | "signed-out"; busy: boolean; error: string | null } | null;
};

/** M47: a round as the player sees it. `news`: what another player just did, shown for a moment. */
export type RoomGroupView = {
  code: string;
  players: readonly { name: string; me: boolean; away: boolean }[];
  status: "ok" | "offline" | "expired" | "gone";
  news: string | null;
};

/** Whether the viewer may report a published room; null for shared rooms. */
export type RoomAccess = "yes" | "loading" | "signed-out" | "own" | "hidden" | "reported";

export type RoomInfo = {
  author: string | null;
  description: string;
  playCount: number | null;
  publishedAt: string | null;
  access: RoomAccess | null;
};

export type RoomViewActions = {
  tap(spot: string): void;
  closeOpen(): void;
  setCode(value: string): void;
  submitCode(): void;
  dispatch(move: unknown): void;
  undo(): void;
  redo(): void;
  restartPuzzle(): void;
  backToRoom(): void;
  replayPuzzle(): void;
  openHints(): void;
  closeHints(): void;
  nextHint(): void;
  showSpots(): void;
  dismissIntro(): void;
  dismissSceneText(): void;
  restartRoom(): void;
  hideBrowserBars(): void;
  backToEditor(): void;
  openInfo(): void;
  closeInfo(): void;
  share(): void;
  openReport(): void;
  report: ReportDialogActions;
  startGroup(): void; // M47
  invite(): void;
  leaveGroup(): void;
};

/**
 * An escape room (M44): the scene as a 16:9 picture with tap areas, and over it what they open. On a phone held upright
 * the room asks to be turned (CSS); puzzles inside the room work upright too.
 */
export function roomView(model: RoomViewModel, actions: RoomViewActions) {
  if (model.puzzle) return roomPuzzle(model, model.puzzle, actions);
  const { data, save } = model;
  const scene = data.scenes.find((s) => s.id === save.progress.scene) ?? data.scenes[0]!;
  const won = save.progress.shared.won;
  return html`<div class="room">
    ${roomBar(model, scene, actions)}
    <div class="room-stage-wrap">
      <div class="room-stage ${model.spotsVisible ? "show-spots" : ""}">
        ${picture(scene.image, model.images, scene.name)}
        ${activeSpots(data, save.progress).map(
          (spot) => html`<button
            type="button"
            class="room-spot"
            style="left:${spot.rect.x}%;top:${spot.rect.y}%;width:${spot.rect.w}%;height:${spot.rect.h}%"
            aria-label=${spot.label}
            title=${spot.label}
            @click=${() => actions.tap(spot.id)}
          ></button>`,
        )}
      </div>
      ${model.sceneText && scene.text && !won && save.introSeen
        ? html`<div class="room-note" role="status">
            <p>${scene.text}</p>
            <button type="button" class="icon-button" aria-label=${t("close")} @click=${actions.dismissSceneText}>${icon("close", 18)}</button>
          </div>`
        : nothing}
      ${model.group ? groupNotes(model.group) : nothing}
      <div class="room-rotate" aria-hidden="true">
        <span class="room-rotate-phone"></span>
        <p>${t("roomRotate")}</p>
      </div>
    </div>
    ${!save.introSeen ? introSheet(model, actions) : nothing}
    ${model.open?.kind === "lock" ? lockSheet(model, model.open.lock, actions) : nothing}
    ${model.open?.kind === "view" ? viewSheet(model, model.open.view, actions) : nothing}
    ${model.hintsOpen ? hintsSheet(model, scene, actions) : nothing}
    ${won && !model.open && !model.infoOpen && !model.report ? wonSheet(model, actions) : nothing}
    ${model.info && model.infoOpen ? infoSheet(model, model.info, actions) : nothing}
    ${model.report ? reportDialog({ ...model.report, subject: "room" }, actions.report) : nothing}
  </div>`;
}

function roomBar(model: RoomViewModel, scene: Scene, actions: RoomViewActions) {
  return html`<nav class="full-bar room-bar" aria-label=${t("roomControls")}>
    ${model.test
      ? iconButton({ label: t("backToEditor"), icon: "chevronLeft", onClick: actions.backToEditor })
      : iconButton({ label: t("roomLeave"), icon: "chevronLeft", href: model.backHref })}
    ${model.canHideBrowserBars ? iconButton({ label: t("fullscreenBrowser"), icon: "expand", onClick: actions.hideBrowserBars }) : nothing}
    <h1 class="room-scene-name">${scene.name}</h1>
    <span class="full-bar-gap"></span>
    <span class="room-time" aria-label=${t("roomTime")}>${formatDuration(model.elapsedMs)}</span>
    ${iconButton({ label: t("roomShowSpots"), icon: "eye", onClick: actions.showSpots })}
    ${iconButton({ label: t("roomHints"), icon: "bulb", onClick: actions.openHints })}
    ${model.group ? nothing : iconButton({ label: t("roomRestart"), icon: "restart", onClick: actions.restartRoom })}
    ${model.group
      ? html`<button
          type="button"
          class="icon-button room-group-button"
          aria-label=${t("groupBar", { code: model.group.code, count: model.group.players.length })}
          title=${t("groupRound", { code: model.group.code })}
          @click=${actions.openInfo}
        >
          ${icon("users", 20)}<span aria-hidden="true">${model.group.players.length}</span>
        </button>`
      : model.info
        ? iconButton({ label: t("roomInfo"), icon: "info", onClick: actions.openInfo })
        : nothing}
  </nav>`;
}

const GROUP_STATUS: Record<Exclude<RoomGroupView["status"], "ok">, "groupOffline" | "groupExpired" | "groupGone"> = {
  offline: "groupOffline",
  expired: "groupExpired",
  gone: "groupGone",
};

/** M47: the connection to the round when something is wrong, and what the others just did. */
function groupNotes(group: RoomGroupView) {
  return html`${group.status !== "ok" ? html`<p class="room-group-status" role="status">${t(GROUP_STATUS[group.status])}</p>` : nothing}
    <p class="room-toast" role="status" ?hidden=${group.news === null}>${group.news ?? ""}</p>`;
}

/** M47: in a round its code, players, inviting and leaving; otherwise starting one. */
function groupSection(model: RoomViewModel, actions: RoomViewActions) {
  const { group, groupStart } = model;
  if (group) {
    return html`<section class="room-group" aria-labelledby="room-group-title">
      <h3 id="room-group-title">${icon("users", 18)} ${t("groupRound", { code: group.code })}</h3>
      ${group.status !== "ok" ? html`<p class="notice">${t(GROUP_STATUS[group.status])}</p>` : nothing}
      <ul class="round-players" aria-label=${t("groupPlayers")}>
        ${group.players.map(
          (p) => html`<li class=${p.away ? "away" : ""}>
            <span>${p.name}${p.me ? html` <span class="hint">(${t("groupYou")})</span>` : nothing}</span>
            ${p.away ? html`<span class="hint">${t("groupAway")}</span>` : nothing}
          </li>`,
        )}
      </ul>
      ${group.status === "ok" || group.status === "offline"
        ? html`<button class="block" @click=${actions.invite}>${icon("qr", 18)}${t("groupInvite")}</button>`
        : nothing}
      <button class="secondary block" @click=${actions.leaveGroup}>${icon("logOut", 18)}${t("groupLeave")}</button>
    </section>`;
  }
  if (!groupStart) return nothing;
  return html`<section class="room-group" aria-labelledby="room-group-title">
    <h3 id="room-group-title">${icon("users", 18)} ${t("groupPlay")}</h3>
    <p class="hint">${t("groupPlayIntro")}</p>
    ${groupStart.access === "yes"
      ? html`<button class="block" ?disabled=${groupStart.busy} @click=${actions.startGroup}>
          ${groupStart.busy ? t("groupStarting") : html`${icon("users", 18)}${t("groupPlay")}`}
        </button>`
      : html`<p class="hint">${t("groupSignIn")} <a href="#/account">${t("accountLink")}</a></p>`}
    ${groupStart.error ? html`<p class="status-problem" role="alert">${groupStart.error}</p>` : nothing}
  </section>`;
}

/** M46: who made a published or shared room, sharing it and reporting it. */
function infoSheet(model: RoomViewModel, info: RoomInfo, actions: RoomViewActions) {
  // A shared room names its author only if the document does; a published one always had one.
  const by = info.author !== null ? t("galleryBy", { author: info.author }) : info.access === null ? "" : t("galleryByUnknown");
  const facts = [
    by,
    info.publishedAt ? timeAgo(info.publishedAt, Date.now()) : "",
    tn("roomScenes", model.data.scenes.length),
    info.playCount === null ? "" : tn("galleryPlays", info.playCount),
  ].filter(Boolean);
  return sheet(
    "room-info-title",
    actions.closeInfo,
    html`<div class="room-dialog">
      <h2 id="room-info-title" class="sheet-title">${model.title}</h2>
      <p class="hint">${facts.join(" · ")}</p>
      ${info.description ? html`<p class="room-story">${info.description}</p>` : nothing}
      ${info.access === "hidden" ? html`<p class="notice">${t("roomHidden")}</p>` : nothing}
      ${groupSection(model, actions)}
      <button class="block" @click=${actions.share}>${icon("share", 18)}${t("roomShare")}</button>
      ${info.access === "yes" ? html`<button class="secondary block" @click=${actions.openReport}>${icon("flag", 18)}${t("roomReport")}</button>` : nothing}
      ${info.access === "reported" ? html`<p class="hint">${t("roomReportAlready")}</p>` : nothing}
      ${info.access === "signed-out" ? html`<p class="hint">${t("roomReportSignIn")} <a href="#/account">${t("accountLink")}</a></p>` : nothing}
      <button class="secondary block" @click=${actions.closeInfo}>${t("close")}</button>
    </div>`,
  );
}

/** A scene or view picture: built in (SVG) or own (image key). */
function picture(ref: ImageRef, images: ImageSource, label: string) {
  if (!("key" in ref)) {
    return html`<svg class="room-picture" viewBox=${ROOM_VIEWBOX} role="img" aria-label=${label}>${drawnPicture(ref)}</svg>`;
  }
  const url = images.url(ref.key);
  return url && url !== "loading"
    ? html`<img class="room-picture" src=${url} alt=${label} />`
    : html`<svg class="room-picture" viewBox=${ROOM_VIEWBOX} role="img" aria-label=${label}>${svg`<rect width="1600" height="900" fill="#444" />`}</svg>`;
}

function introSheet(model: RoomViewModel, actions: RoomViewActions) {
  return sheet(
    "room-intro-title",
    actions.dismissIntro,
    html`<div class="room-dialog">
      <h2 id="room-intro-title" class="sheet-title">${model.title}</h2>
      <p class="room-story">${model.data.intro}</p>
      <button class="large block" autofocus @click=${actions.dismissIntro}>${t("roomStart")}</button>
    </div>`,
  );
}

function lockSheet(model: RoomViewModel, id: string, actions: RoomViewActions) {
  const lock = model.data.locks.find((l) => l.id === id);
  if (!lock) return nothing;
  return sheet(
    "room-lock-title",
    actions.closeOpen,
    html`<form
      class="room-dialog"
      @submit=${(e: SubmitEvent) => {
        e.preventDefault();
        actions.submitCode();
      }}
    >
      <h2 id="room-lock-title" class="sheet-title">${icon("lock", 20)} ${lock.name}</h2>
      ${lock.prompt ? html`<p>${lock.prompt}</p>` : nothing}
      <label class="field">
        <span>${t("roomLockCode")}</span>
        <input
          class="room-code"
          type="text"
          autocomplete="off"
          autocapitalize="characters"
          spellcheck="false"
          maxlength="40"
          autofocus
          .value=${model.lock.input}
          aria-invalid=${model.lock.wrong ? "true" : "false"}
          @input=${(e: Event) => actions.setCode((e.target as HTMLInputElement).value)}
        />
      </label>
      <p class="status-problem" role="alert">${model.lock.wrong ? t("roomLockWrong") : nothing}</p>
      <div class="dialog-actions">
        <button type="button" class="secondary" @click=${actions.closeOpen}>${t("close")}</button>
        <button type="submit" ?disabled=${model.lock.input.trim() === ""}>${t("roomLockOpen")}</button>
      </div>
    </form>`,
  );
}

function viewSheet(model: RoomViewModel, id: string, actions: RoomViewActions) {
  const view = model.data.views.find((v) => v.id === id);
  if (!view) return nothing;
  return sheet(
    "room-view-title",
    actions.closeOpen,
    html`<div class="room-dialog">
      <h2 id="room-view-title" class="sheet-title">${view.name}</h2>
      ${view.image ? html`<div class="room-view-picture">${picture(view.image, model.images, view.name)}</div>` : nothing}
      ${view.text ? html`<p class="room-story">${view.text}</p>` : nothing}
      <button class="large block" autofocus @click=${actions.closeOpen}>${t("close")}</button>
    </div>`,
  );
}

function hintsSheet(model: RoomViewModel, scene: Scene, actions: RoomViewActions) {
  const shown = model.save.hints[scene.id] ?? 0;
  return sheet(
    "room-hints-title",
    actions.closeHints,
    html`<div class="room-dialog">
      <h2 id="room-hints-title" class="sheet-title">${icon("bulb", 20)} ${t("roomHints")}</h2>
      ${scene.hints.length === 0
        ? html`<p>${t("roomHintNone")}</p>`
        : html`<ol class="room-hints" aria-live="polite">
              ${scene.hints.slice(0, shown).map((hint) => html`<li>${hint}</li>`)}
            </ol>
            ${shown < scene.hints.length
              ? html`<button class="block" @click=${actions.nextHint}>${t(shown === 0 ? "roomHintFirst" : "roomHintNext")}</button>`
              : html`<p class="hint">${t("roomHintsAll")}</p>`}`}
      <button class="secondary block" @click=${actions.closeHints}>${t("close")}</button>
    </div>`,
  );
}

function wonSheet(model: RoomViewModel, actions: RoomViewActions) {
  const time = formatDuration(model.save.wonAfterMs ?? model.elapsedMs);
  return sheet(
    "room-won-title",
    () => {},
    html`<div class="solved room-dialog">
      <span class="solved-icon">${icon("door", 32)}</span>
      <h2 id="room-won-title" class="solved-title">${t("roomWon")}</h2>
      ${model.data.victory ? html`<p class="room-story">${model.data.victory}</p>` : nothing}
      ${model.group ? html`<p class="solved-sub">${t("groupWon")}</p>` : nothing}
      <p class="solved-sub">${t("roomWonTime", { time })}</p>
      ${model.test
        ? html`<p class="solved-sub">${t("roomWonTest")}</p>
            <button class="large block" @click=${actions.backToEditor}>${t("backToEditor")}</button>`
        : html`<a class="button large block" href=${model.backHref}>${t("toHome")}</a>`}
      ${model.group ? nothing : html`<button class="secondary block" @click=${actions.restartRoom}>${icon("restart", 18)}${t("roomAgain")}</button>`}
    </div>`,
    "solved-sheet",
  );
}

/**
 * A puzzle inside the room: like escape mode, but with the way back to the room. The buttons that appear when solved
 * are guarded: they may appear under the finger that made the solving move (press-guard.ts).
 */
function roomPuzzle(model: RoomViewModel, puzzle: RoomPuzzle, actions: RoomViewActions) {
  const { session } = puzzle;
  const showUndo = session.type.controls?.undo !== false;
  const stageModel: PlayViewModel = {
    title: "",
    session,
    showSolved: false,
    origin: "example",
    presentation: "full",
    progressKey: null,
    images: model.images,
    minMoves: null,
    timer: IDLE_TIMER,
  };
  const solved = session.solved || puzzle.alreadySolved;
  const result = parseResult(puzzle.result);
  return html`<div class="play-full room-puzzle">
    <nav class="full-bar" aria-label=${t("playControls")}>
      ${iconButton({ label: t("roomBack"), icon: "chevronLeft", onClick: actions.backToRoom })}
      <h1 class="room-scene-name">${model.data.puzzles.find((p) => p.id === puzzle.id)?.name ?? ""}</h1>
      <span class="full-bar-gap"></span>
      ${showUndo
        ? html`${iconButton({ label: t("undo"), icon: "undo", onClick: actions.undo, disabled: !canUndo(session) || solved })}
          ${iconButton({ label: t("redo"), icon: "redo", onClick: actions.redo, disabled: !canRedo(session) || solved })}`
        : nothing}
      ${iconButton({ label: t("restart"), icon: "restart", onClick: actions.restartPuzzle, disabled: session.history.length === 1 || solved })}
    </nav>
    ${playStage(stageModel, { dispatch: actions.dispatch, undo: actions.undo, redo: actions.redo, restart: actions.restartPuzzle }, { controls: false })}
    <div class="full-solved-region" role="status">
      ${solved
        ? html`<div class="full-solved escape-solved">
            <p class="full-solved-title">${icon("check", 22)}${t(puzzle.alreadySolved ? "roomAlreadySolved" : "solvedTitle")}</p>
            ${result ? html`<p class="escape-result-label">${t("escapeResult")}</p>${resultView(result)}` : nothing}
            <div class="full-solved-actions">
              <button type="button" @pointerdown=${markPress} @click=${guarded(actions.backToRoom)}>${icon("chevronLeft", 18)}${t("roomBack")}</button>
              ${puzzle.alreadySolved
                ? html`<button type="button" class="secondary" @pointerdown=${markPress} @click=${guarded(actions.replayPuzzle)}>${t("roomPlayAgain")}</button>`
                : nothing}
            </div>
          </div>`
        : nothing}
    </div>
  </div>`;
}
