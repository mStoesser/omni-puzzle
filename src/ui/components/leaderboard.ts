import { html, nothing } from "lit-html";
import { myEntry } from "../../core/scores.ts";
import type { DailyOutcome, Leaderboard, LeaderboardEntry } from "../../core/scores.ts";
import { formatDuration } from "../../core/timer.ts";
import { t } from "../../i18n/t.ts";
import type { MessageKey } from "../../i18n/t.ts";

/** Sending the own result after solving. */
export type SubmitState =
  | { status: "idle" } // not solved yet in this session
  | { status: "sending" }
  | { status: "done"; improved: boolean; daily?: DailyOutcome } // `daily`: played as the puzzle of the day
  | { status: "queued" } // offline: sent later
  | { status: "error"; text: MessageKey };

export type LeaderboardModel = {
  ranking: "moves" | "time";
  day: string | null; // M26: the leaderboard of this day (puzzle of the day, first solutions only); null = all time
  board: Leaderboard | null; // null = loading or failed
  error: MessageKey | null;
  submit: SubmitState;
  confirmClear: string | null; // moderators: user whose entries wait for confirmation
  busy: boolean;
};

/** Who is looking: signed out and authors only get a hint; moderators may remove entries. */
export type LeaderboardViewer = "signed-out" | "own" | "player" | "moderator";

export type LeaderboardActions = {
  askClear(userId: string | null): void;
  clear(userId: string): void;
};

function result(entry: LeaderboardEntry, ranking: LeaderboardModel["ranking"]) {
  const time = formatDuration(entry.timeMs);
  if (ranking === "time" || entry.moves === null) return time;
  return t(entry.moves === 1 ? "leaderboardResultOne" : "leaderboardResult", { moves: entry.moves, time });
}

/** The top 10, and the own entry below a gap if it is further down (the server then sends it as 11th row). */
function entries(model: LeaderboardModel, board: Leaderboard, viewer: LeaderboardViewer, actions: LeaderboardActions) {
  if (board.entries.length === 0) return html`<p class="hint">${t("leaderboardEmpty")}</p>`;
  const top = board.entries.slice(0, 10);
  const below = board.entries[10] ?? null;
  const row = (entry: LeaderboardEntry) => html`<li class="leaderboard-entry ${entry.isMe ? "is-me" : ""}">
    <span class="leaderboard-place"><span class="visually-hidden">${t("leaderboardPlaceLabel")} </span>${entry.place}</span>
    <span class="leaderboard-name">${entry.username}${entry.isMe ? html` <span class="hint">${t("leaderboardYou")}</span>` : nothing}</span>
    <span class="leaderboard-result">${result(entry, model.ranking)}</span>
    ${viewer === "moderator" && !entry.isMe ? clearButton(model, entry, actions) : nothing}
  </li>`;
  return html`<ol class="leaderboard-list">
      ${top.map(row)}
    </ol>
    ${below ? html`<ol class="leaderboard-list leaderboard-below">${row(below)}</ol>` : nothing}
    ${model.confirmClear
      ? html`<div class="leaderboard-confirm" role="alert">
          <p>${t("leaderboardClearConfirm", { name: board.entries.find((e) => e.userId === model.confirmClear)?.username ?? "" })}</p>
          <div class="account-actions">
            <button class="danger-button" ?disabled=${model.busy} @click=${() => actions.clear(model.confirmClear!)}>${t("leaderboardClear")}</button>
            <button class="secondary" @click=${() => actions.askClear(null)}>${t("cancel")}</button>
          </div>
        </div>`
      : nothing}`;
}

function clearButton(model: LeaderboardModel, entry: LeaderboardEntry, actions: LeaderboardActions) {
  return html`<button class="link-button leaderboard-clear" ?disabled=${model.busy} @click=${() => actions.askClear(entry.userId)}
    aria-label=${t("leaderboardClearFor", { name: entry.username })}>${t("leaderboardClearShort")}</button>`;
}

function hint(viewer: LeaderboardViewer) {
  return viewer === "signed-out"
    ? html`<p class="hint">${t("leaderboardSignIn")} <a href="#/account">${t("accountLink")}</a></p>`
    : viewer === "own"
      ? html`<p class="hint">${t("leaderboardOwn")}</p>`
      : nothing;
}

/** Beside the board: the leaderboard of the puzzle. */
export function leaderboardSection(model: LeaderboardModel, viewer: LeaderboardViewer, actions: LeaderboardActions) {
  return html`<section class="box leaderboard" aria-labelledby="leaderboard-title">
    <h2 id="leaderboard-title">${t(model.day ? "dailyLeaderboardTitle" : "leaderboardTitle")}</h2>
    <p class="hint">
      ${t(model.ranking === "time" ? "leaderboardByTime" : "leaderboardByMoves")}${model.day ? html` ${t("dailyFirstOnly")}` : nothing}
    </p>
    ${model.board
      ? entries(model, model.board, viewer, actions)
      : model.error
        ? html`<p class="hint">${t(model.error)}</p>`
        : html`<p class="hint" role="status">${t("loading")}</p>`}
    ${hint(viewer)}
  </section>`;
}

/** In the solved sheet: what happened to the own result, and the top 10 on request. */
export function leaderboardOutcome(model: LeaderboardModel, viewer: LeaderboardViewer, actions: LeaderboardActions) {
  const { submit, board } = model;
  const me = board ? myEntry(board) : null;
  const status =
    viewer === "signed-out" || viewer === "own"
      ? hint(viewer)
      : submit.status === "sending" || (submit.status === "done" && !board && !model.error)
        ? html`<p class="hint">${t("leaderboardSending")}</p>`
        : submit.status === "queued"
          ? html`<p class="hint">${t("leaderboardQueued")}</p>`
          : submit.status === "error"
            ? html`<p class="notice">${t(submit.text)}</p>`
            : submit.status === "done" && submit.daily === "expired"
              ? html`<p class="hint">${t("dailyExpired")}</p>`
              : submit.status === "done" && me && board
                ? html`<p class="leaderboard-place-line">
                    <strong>${t(model.day ? "dailyPlace" : "leaderboardPlace", { place: me.place, total: board.total })}</strong>
                    ${model.day
                      ? submit.daily === "repeat"
                        ? html`<span class="hint">${t("dailyRepeat")}</span>`
                        : nothing
                      : submit.improved
                        ? nothing
                        : html`<span class="hint">${t("leaderboardNotImproved")}</span>`}
                  </p>`
                : nothing;
  return html`<div class="leaderboard-outcome box" aria-live="polite">
    ${status}
    ${board && board.entries.length > 0
      ? html`<details class="leaderboard-details">
          <summary>${t("leaderboardShowTop")}</summary>
          ${entries(model, board, viewer === "moderator" ? "player" : viewer, actions)}
        </details>`
      : nothing}
  </div>`;
}
