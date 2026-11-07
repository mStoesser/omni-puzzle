import { html, nothing } from "lit-html";
import { formatRoute } from "../../core/router.ts";
import { DEFAULT_FILTER } from "../../core/gallery.ts";
import type { GalleryItem } from "../../core/gallery.ts";
import type { DailyPuzzle } from "../../core/daily.ts";
import type { AnyPuzzleType } from "../../core/types.ts";
import { galleryTile } from "../components/gallery-card.ts";
import { avatar } from "../components/nav.ts";
import type { NavAccount } from "../components/nav.ts";
import { sheet, statusBadge, typeBadge, typeTile, typeVars } from "../components/ui.ts";
import { icon, logo } from "../icons.ts";
import { t } from "../../i18n/t.ts";
import type { Example } from "../../puzzles/index.ts";

/** The signed-in user's name for the greeting; null = signed out or no backend. */
export type HomeAccount = NavAccount & { username: string | null };

/** The newest published puzzles (empty while loading or on errors); `solved` checks local progress by content key. */
export type HomeGallery = { newest: readonly GalleryItem[]; solved(contentKey: string): boolean };

/** The puzzle of the day (M26); `solved` and `streak` from the server or this device (dailyStatus). */
export type HomeDaily =
  | { status: "loading" }
  | { status: "none" } // nothing to choose from (empty gallery)
  | { status: "ready"; puzzle: DailyPuzzle; solved: boolean; streak: number };

export type HomeViewModel = {
  types: readonly AnyPuzzleType[];
  examples: readonly Example[];
  solvedExamples: ReadonlySet<string>; // ids of solved examples
  account: HomeAccount;
  gallery: HomeGallery | null; // null = no backend
  daily: HomeDaily | null; // null = no backend, or it could not be loaded (offline)
  typeSheet: string | null; // type whose levels are shown in a sheet (phones)
};

export type HomeViewActions = {
  openType(id: string): void;
  closeType(): void;
  openBuild(): void;
};

export function homeView(model: HomeViewModel, actions: HomeViewActions) {
  const { types, examples, solvedExamples } = model;
  const solvedCount = examples.filter((e) => solvedExamples.has(e.id)).length;
  const sheetType = types.find((type) => type.id === model.typeSheet);
  return html`
    <header class="home-head mobile-only">
      <span class="brand">${logo(32)}<span>${t("appTitle")}</span></span>
      ${avatar(model.account)}
    </header>
    <div class="home-hello">
      ${model.account.username ? html`<p>${t("homeHello", { name: model.account.username })}</p>` : nothing}
      <h1>${t("homeHeadline")}</h1>
    </div>

    <div class="home-top ${model.daily ? "with-daily" : ""}">${model.daily ? dailyCard(model.daily, types) : nothing}${buildCard(types, actions)}</div>

    <section aria-labelledby="home-types">
      <div class="section-head">
        <h2 id="home-types">${t("homeTypes")}</h2>
        <span class="section-note">${t("homeSolvedOf", { solved: solvedCount, total: examples.length })}</span>
      </div>
      ${types.length === 0
        ? html`<p>${t("homeNoTypes")}</p>`
        : html`<ul class="type-grid">
            ${types.map((type) => html`<li>${typeCard(type, examplesOf(type, examples), solvedExamples, actions)}</li>`)}
            <li class="type-more">
              ${icon("plus", 22)}
              <span class="type-more-title">${t("homeMoreTypes")}</span>
              <span class="type-more-text">${t("homeMoreTypesText")}</span>
            </li>
          </ul>`}
    </section>

    ${model.gallery ? newInGallery(model.gallery, types) : nothing}
    ${siteFooter()}
    ${sheetType ? levelSheet(sheetType, examplesOf(sheetType, examples), solvedExamples, model.gallery !== null, actions) : nothing}
  `;
}

function examplesOf(type: AnyPuzzleType, examples: readonly Example[]) {
  return examples.filter((e) => e.doc.type === type.id);
}

/** The puzzle of the day: type, level, solved, and the streak. The whole card leads to #/daily. */
function dailyCard(daily: HomeDaily, types: readonly AnyPuzzleType[]) {
  const head = html`<span class="daily-card-kicker">${icon("calendar", 16)}${t("dailyTitle")}</span>`;
  if (daily.status !== "ready") {
    return html`<section class="daily-card" aria-label=${t("dailyTitle")}>
      ${head}
      <p class="daily-card-text" role=${daily.status === "loading" ? "status" : nothing}>
        ${t(daily.status === "loading" ? "loading" : "dailyNone")}
      </p>
    </section>`;
  }
  const { puzzle, solved, streak } = daily;
  const type = types.find((x) => x.id === puzzle.type);
  return html`<a class="daily-card typed" style=${typeVars(type)} href="#/daily">
    ${head}
    <span class="daily-card-main">
      ${typeTile(type)}
      <span class="daily-card-body">
        <span class="daily-card-title">${puzzle.title}</span>
        <span class="daily-card-badges">
          ${typeBadge(type, puzzle.type, false)}${puzzle.level ? html`<span class="badge">${t(`level${puzzle.level}`)}</span>` : nothing}
          ${solved ? statusBadge("solved") : nothing}
        </span>
      </span>
    </span>
    <span class="daily-card-foot">
      <span class="daily-card-streak">${streak > 0 ? html`${icon("flame", 16)}${t(streak === 1 ? "dailyStreakOne" : "dailyStreak", { count: streak })}` : t("dailyStreakNone")}</span>
      <span class="daily-card-go">${t(solved ? "dailyAgain" : "dailyPlay")}${icon("chevronRight", 16)}</span>
    </span>
  </a>`;
}

/** "Build your own": banner on phones (opens the type choice), card with type chips on desktop. */
function buildCard(types: readonly AnyPuzzleType[], actions: HomeViewActions) {
  return html`<section class="build-card" aria-labelledby="home-build">
    <span class="build-card-icon">${icon("pencil", 24)}</span>
    <div class="build-card-text">
      <h2 id="home-build">${t("homeBuildTitle")}</h2>
      <p>${t("homeBuildText")}</p>
    </div>
    <button class="icon-button build-card-go" aria-label=${t("navBuild")} @click=${actions.openBuild}>${icon("chevronRight", 20)}</button>
    <ul class="build-card-types">
      ${types.map(
        (type) => html`<li>
          <a class="chip typed" style=${typeVars(type)} href="#/new/${type.id}"><span class="chip-dot" aria-hidden="true"></span>${t(type.name)}</a>
        </li>`,
      )}
    </ul>
  </section>`;
}

function progress(own: readonly Example[], solved: ReadonlySet<string>) {
  const done = own.filter((e) => solved.has(e.id)).length;
  return html`<span class="type-card-progress">${t("homeTypeSolved", { solved: done, total: own.length })}</span>
    <span class="progress" aria-hidden="true"><span style="width:${own.length ? (100 * done) / own.length : 0}%"></span></span>`;
}

/** Type card: compact tile that opens the level sheet on phones, card with the level list on desktop. */
function typeCard(type: AnyPuzzleType, own: readonly Example[], solved: ReadonlySet<string>, actions: HomeViewActions) {
  return html`<div class="type-card typed" style=${typeVars(type)}>
    <button class="type-card-tile" aria-haspopup="dialog" @click=${() => actions.openType(type.id)}>
      ${typeTile(type)}
      <span class="type-card-name">${t(type.name)}</span>
      ${progress(own, solved)}
    </button>
    <div class="type-card-full">
      <div class="type-card-head">
        ${typeTile(type)}
        <div>
          <h3>${t(type.name)}</h3>
          <p>${t(type.description)}</p>
        </div>
      </div>
      ${levelList(own, solved)}
    </div>
  </div>`;
}

function levelList(own: readonly Example[], solved: ReadonlySet<string>) {
  return html`<ul class="level-list">
    ${own.map(
      ({ id, doc }) => html`<li>
        <a href="#/play/${id}">
          <span class="level-title">${doc.meta.title}</span>
          ${solved.has(id)
            ? html`<span class="level-status ok">${t("solvedMark")}</span>`
            : doc.meta.minMoves === undefined
              ? nothing
              : html`<span class="level-status">${t("homeLevelMoves", { moves: doc.meta.minMoves })}</span>`}
        </a>
      </li>`,
    )}
  </ul>`;
}

function levelSheet(type: AnyPuzzleType, own: readonly Example[], solved: ReadonlySet<string>, withGallery: boolean, actions: HomeViewActions) {
  return sheet(
    "type-sheet-title",
    actions.closeType,
    html`<div class="type-card-head typed" style=${typeVars(type)}>
        ${typeTile(type)}
        <div>
          <h2 id="type-sheet-title" class="sheet-title">${t(type.name)}</h2>
          <p>${t(type.description)}</p>
        </div>
      </div>
      ${levelList(own, solved)}
      <div class="sheet-actions">
        <a class="button secondary" href="#/new/${type.id}">${icon("pencil", 18)}${t("build")}</a>
        ${withGallery
          ? html`<a class="button secondary" href=${formatRoute({ name: "gallery", filter: { ...DEFAULT_FILTER, type: type.id } })}>
              ${t("typeGallery")}
            </a>`
          : nothing}
      </div>`,
  );
}

function newInGallery(gallery: HomeGallery, types: readonly AnyPuzzleType[]) {
  return html`
    <section aria-labelledby="home-gallery">
      <div class="section-head">
        <h2 id="home-gallery">${t("homeNewInGallery")}</h2>
        <a href="#/gallery">${t("homeGalleryAll")}</a>
      </div>
      ${gallery.newest.length === 0
        ? nothing
        : html`<ul class="tile-scroller">
            ${gallery.newest.map(
              (item) => html`<li>${galleryTile(item, types.find((type) => type.id === item.type), gallery.solved(item.contentKey))}</li>`,
            )}
          </ul>`}
    </section>
  `;
}

export function siteFooter() {
  return html`<footer class="site-footer">
    <a href="#/impressum">${t("imprint")}</a>
    <a href="#/datenschutz">${t("privacy")}</a>
  </footer>`;
}
