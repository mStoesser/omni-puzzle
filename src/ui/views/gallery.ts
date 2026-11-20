import { html, nothing } from "lit-html";
import { LEVELS } from "../../core/difficulty.ts";
import type { ChainItem } from "../../core/chains.ts";
import { CHAIN_SORTS, DEFAULT_FILTER, GALLERY_SORTS, normalizeSearch } from "../../core/gallery.ts";
import type { GalleryFilter, GalleryItem, GallerySort, GalleryView } from "../../core/gallery.ts";
import type { Registry } from "../../core/registry.ts";
import { LANG_NAMES, t, tn } from "../../i18n/t.ts";
import { isPuzzleLang, PUZZLE_LANGS } from "../../core/types.ts";
import type { MessageKey } from "../../i18n/t.ts";
import { chainCard, galleryCard } from "../components/gallery-card.ts";
import { roomCard } from "../components/room-card.ts";
import type { RoomCardModel } from "../components/room-card.ts";
import { searchField } from "../components/search-field.ts";
import type { RoomItem } from "../../rooms/published.ts";
import { chip, segment } from "../components/ui.ts";
import { icon } from "../icons.ts";

export type GalleryViewModel = {
  filter: GalleryFilter;
  items: GalleryItem[]; // puzzles loaded so far
  chains: ChainItem[]; // chains loaded so far (view "chains")
  rooms: RoomItem[]; // escape rooms loaded so far (view "rooms", M46)
  status: "loading" | "idle" | "loading-more" | "error";
  error: MessageKey | null;
  hasMore: boolean;
  announcement: string; // live region text after loading more
};

export type GalleryViewActions = {
  setFilter(filter: GalleryFilter): void;
  loadMore(): void;
  retry(): void;
  /** M47: joining a round of playing an escape room together by its code; false if it is no code. */
  joinRound(code: string): boolean;
};

const SORT_TEXT: Record<GallerySort, MessageKey> = {
  new: "gallerySortNew",
  likes: "gallerySortLikes",
  plays: "gallerySortPlays",
  hardest: "gallerySortHardest",
};

// Typing searches after a short pause (M37); Enter searches at once.
const SEARCH_DELAY_MS = 400;
let searchTimer: ReturnType<typeof setTimeout> | undefined;

function search(filter: GalleryFilter, value: string, actions: GalleryViewActions, delay: number) {
  clearTimeout(searchTimer);
  const q = normalizeSearch(value);
  if (q === filter.q) return; // e.g. a single letter: nothing to ask the server yet
  searchTimer = setTimeout(() => actions.setFilter({ ...filter, q }), delay);
}

const VIEW_TEXT: Record<GalleryView, { intro: MessageKey; count: MessageKey; countMore: MessageKey; search: MessageKey; placeholder: MessageKey; empty: MessageKey }> = {
  puzzles: { intro: "galleryIntro", count: "galleryCount", countMore: "galleryCountMore", search: "searchLabel", placeholder: "searchPlaceholder", empty: "galleryEmpty" },
  chains: { intro: "galleryChainsIntro", count: "galleryChainCount", countMore: "galleryChainCountMore", search: "searchChainsLabel", placeholder: "searchChainsPlaceholder", empty: "galleryChainsEmpty" },
  rooms: { intro: "galleryRoomsIntro", count: "galleryRoomCount", countMore: "galleryRoomCountMore", search: "searchRoomsLabel", placeholder: "searchRoomsPlaceholder", empty: "galleryRoomsEmpty" },
};

/**
 * `solved(contentKey)` tells whether the puzzle was solved on this device. `roomCards`: the loaded escape rooms as
 * cards, with their pictures and how far this device got (drawn by the room part of the app, M46).
 */
export function galleryView(
  model: GalleryViewModel,
  registry: Registry,
  solved: (contentKey: string) => boolean,
  roomCards: readonly RoomCardModel[],
  actions: GalleryViewActions,
) {
  const { filter } = model;
  const chains = filter.view === "chains";
  const rooms = filter.view === "rooms";
  const text = VIEW_TEXT[filter.view];
  const filtered = filter.type !== null || filter.level !== null || filter.lang !== null;
  const loaded = model.status !== "loading";
  const count = chains ? model.chains.length : rooms ? model.rooms.length : model.items.length;
  const countKey: MessageKey = model.hasMore ? text.countMore : text.count;
  return html`
    <header class="page-head">
      <h1>${t("gallery")}</h1>
      <p>${t(text.intro)}</p>
    </header>

    <div class="gallery-switch">
      ${segment<GalleryView>(
        t("galleryViewLabel"),
        [
          { value: "puzzles", label: t("galleryViewPuzzles"), icon: "puzzle" },
          { value: "chains", label: t("galleryViewChains"), icon: "chain" },
          { value: "rooms", label: t("galleryViewRooms"), icon: "door" },
        ],
        filter.view,
        (view) => actions.setFilter({ ...DEFAULT_FILTER, view, q: filter.q }),
      )}
      ${chains ? html`<a class="button secondary" href="#/chain/new">${icon("plus", 18)}${t("chainNewButton")}</a>` : nothing}
    </div>

    ${searchField({
      id: "gallery-search",
      label: t(text.search),
      placeholder: t(text.placeholder),
      value: filter.q ?? "",
      onInput: (value) => search(filter, value, actions, SEARCH_DELAY_MS),
      onSubmit: (value) => search(filter, value, actions, 0),
      extraClass: "gallery-search",
    })}

    ${rooms ? roundJoin(actions) : nothing}

    ${chains || rooms
      ? nothing
      : html`<div class="chips" role="group" aria-label=${t("galleryType")}>
          ${chip(t("galleryChipAll"), filter.type === null, () => actions.setFilter({ ...filter, type: null }))}
          ${registry.all().map((type) =>
            chip(t(type.name), filter.type === type.id, () => actions.setFilter({ ...filter, type: type.id }), type),
          )}
        </div>`}

    <div class="list-bar">
      <span class="list-count" role="status">
        ${loaded && model.status !== "error" ? tn(countKey, count) : nothing}
      </span>
      ${chains || rooms
        ? nothing
        : select(t("galleryLevel"), String(filter.level ?? ""), [["", t("galleryAllLevels")], ...LEVELS.map((l) => [String(l), t(`level${l}`)] as const)], (value) =>
            actions.setFilter({ ...filter, level: value ? (Number(value) as GalleryFilter["level"]) : null }),
          )}
      ${chains
        ? nothing
        : select(t("galleryLanguage"), filter.lang ?? "", [["", t("galleryAllLanguages")], ...PUZZLE_LANGS.map((l) => [l, LANG_NAMES[l]] as const)], (value) =>
            actions.setFilter({ ...filter, lang: isPuzzleLang(value) ? value : null }),
          )}
      ${select(t("gallerySort"), filter.sort, (chains || rooms ? CHAIN_SORTS : GALLERY_SORTS).map((s) => [s, t(SORT_TEXT[s])] as const), (value) =>
        actions.setFilter({ ...filter, sort: value as GallerySort }),
      )}
    </div>

    ${model.status === "loading"
      ? html`<p role="status">${t("loading")}</p>`
      : html`
          ${count === 0 && model.status !== "error"
            ? html`<p class="empty">
                ${filter.q
                  ? t("gallerySearchEmpty", { q: filter.q })
                  : filtered ? t("galleryEmptyFiltered") : t(text.empty)}
              </p>`
            : rooms
              ? html`<ul class="room-grid">
                  ${roomCards.map((card) => html`<li>${roomCard(card)}</li>`)}
                </ul>`
              : chains
              ? html`<ul class="card-list">
                  ${model.chains.map((item) => html`<li>${chainCard(item, item.stepKeys.filter(solved).length)}</li>`)}
                </ul>`
              : html`<ul class="card-list">
                  ${model.items.map((item) => html`<li>${galleryCard(item, registry.get(item.type), solved(item.contentKey))}</li>`)}
                </ul>`}
          ${model.status === "error"
            ? html`<p class="notice" role="alert">${t(model.error ?? "apiServer")}</p>
                <button class="secondary" @click=${actions.retry}>${t("galleryRetry")}</button>`
            : model.hasMore
              ? html`<button class="secondary block gallery-more" ?disabled=${model.status === "loading-more"} @click=${actions.loadMore}>
                  ${model.status === "loading-more" ? t("galleryLoadingMore") : t("galleryMore")}
                </button>`
              : nothing}
        `}
    <p class="visually-hidden" aria-live="polite">${model.announcement}</p>
  `;
}

/** M47: a round's code, for players without the link (read out or seen on another phone). */
function roundJoin(actions: GalleryViewActions) {
  return html`<form
    class="round-join-inline"
    aria-label=${t("groupJoinLabel")}
    @submit=${(e: SubmitEvent) => {
      e.preventDefault();
      const input = (e.target as HTMLFormElement).elements.namedItem("round-code") as HTMLInputElement;
      // Shown directly: the form keeps no state of its own, a valid code leaves the page.
      const invalid = !actions.joinRound(input.value);
      input.setAttribute("aria-invalid", String(invalid));
      const problem = (e.target as HTMLFormElement).querySelector(".status-problem");
      if (problem) problem.textContent = invalid ? t("groupJoinCodeInvalid") : "";
    }}
  >
    <label class="field">
      <span>${icon("users", 16)} ${t("groupJoinCode")}</span>
      <span class="round-join-row">
        <input name="round-code" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="9" placeholder=${t("groupJoinPlaceholder")} />
        <button type="submit" class="secondary">${t("groupJoinButton")}</button>
      </span>
    </label>
    <p class="status-problem" role="alert"></p>
  </form>`;
}

/** Native select that looks like a quiet text button with a chevron. */
function select(label: string, value: string, options: readonly (readonly [string, string])[], onChange: (value: string) => void) {
  return html`<label class="quiet-select">
    <span class="visually-hidden">${label}</span>
    <select @change=${(e: Event) => onChange((e.target as HTMLSelectElement).value)}>
      ${options.map(([v, text]) => html`<option value=${v} ?selected=${v === value}>${text}</option>`)}
    </select>
    ${icon("chevronDown", 16)}
  </label>`;
}
