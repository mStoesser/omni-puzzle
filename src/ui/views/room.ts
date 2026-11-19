import { html, nothing, svg } from "lit-html";
import { canRedo, canUndo } from "../../core/session.ts";
import type { AnyPlaySession } from "../../core/session.ts";
import { parseResult } from "../../core/result.ts";
import { formatDuration, IDLE_TIMER } from "../../core/timer.ts";
import type { ImageSource } from "../../core/types.ts";
import { activeSpots } from "../../rooms/logic.ts";
import type { EscapeRoomData, ImageRef, Opening, Scene } from "../../rooms/logic.ts";
import type { RoomSave } from "../../rooms/save.ts";
import { t } from "../../i18n/t.ts";
import { iconButton, sheet } from "../components/ui.ts";
import { guarded, markPress } from "../components/press-guard.ts";
import { icon } from "../icons.ts";
import { builtinPicture, ROOM_VIEWBOX } from "../room-images.ts";
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
      <div class="room-rotate" aria-hidden="true">
        <span class="room-rotate-phone"></span>
        <p>${t("roomRotate")}</p>
      </div>
    </div>
    ${!save.introSeen ? introSheet(model, actions) : nothing}
    ${model.open?.kind === "lock" ? lockSheet(model, model.open.lock, actions) : nothing}
    ${model.open?.kind === "view" ? viewSheet(model, model.open.view, actions) : nothing}
    ${model.hintsOpen ? hintsSheet(model, scene, actions) : nothing}
    ${won && !model.open ? wonSheet(model, actions) : nothing}
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
    ${iconButton({ label: t("roomRestart"), icon: "restart", onClick: actions.restartRoom })}
  </nav>`;
}

/** A scene or view picture: built in (SVG) or own (image key). */
function picture(ref: ImageRef, images: ImageSource, label: string) {
  if ("builtin" in ref) {
    return html`<svg class="room-picture" viewBox=${ROOM_VIEWBOX} role="img" aria-label=${label}>${builtinPicture(ref.builtin)}</svg>`;
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
      <p class="solved-sub">${t("roomWonTime", { time })}</p>
      ${model.test
        ? html`<p class="solved-sub">${t("roomWonTest")}</p>
            <button class="large block" @click=${actions.backToEditor}>${t("backToEditor")}</button>`
        : html`<a class="button large block" href=${model.backHref}>${t("toHome")}</a>`}
      <button class="secondary block" @click=${actions.restartRoom}>${icon("restart", 18)}${t("roomAgain")}</button>
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
