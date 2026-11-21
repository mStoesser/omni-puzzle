import { html, nothing } from "lit-html";
import { LIBRARY_FILTERS, matchesFilter, matchesTitle } from "../../core/library-status.ts";
import type { LibraryFilter, LibraryStatus } from "../../core/library-status.ts";
import { parseTheme } from "../../core/puzzle-theme.ts";
import type { PuzzleRecord } from "../../core/storage.ts";
import type { AnyPuzzleType } from "../../core/types.ts";
import { t, tn } from "../../i18n/t.ts";
import { thumb } from "../components/gallery-card.ts";
import { searchField } from "../components/search-field.ts";
import { chip, popoverMenu, statusBadge, typeVars } from "../components/ui.ts";
import type { MenuItem } from "../components/ui.ts";
import { icon } from "../icons.ts";
import { timeAgo } from "../time.ts";

/** `contentKey` (M35): key of the checked document; null for drafts with problems (then also not playable). */
export type LibraryItem = {
  record: PuzzleRecord;
  type: AnyPuzzleType;
  playable: boolean;
  contentKey: string | null;
};

/** An own escape room (M45); `verified` = won by its creator, so it can be played. `status` as for puzzles (M46). */
export type LibraryRoomItem = { id: string; title: string; updatedAt: string; verified: boolean; status: LibraryStatus };

export type LibraryViewActions = {
  newRoom(): void; // M45
  removeRoom(id: string): void;
  duplicate(id: string): void;
  remove(id: string): void;
  openBuild(): void;
  setFilter(filter: LibraryFilter): void;
  setQuery(query: string): void; // M37: local title search
};

const FILTER_TEXT = { all: "libraryFilterAll", drafts: "libraryFilterDrafts", shared: "libraryFilterShared" } as const;
const EMPTY_TEXT = { all: "libraryEmpty", drafts: "libraryEmptyDrafts", shared: "libraryEmptyShared" } as const;

/**
 * `items` null = still loading; each with its status (M35), filtered here. `synced`: signed in, so the library is
 * synced with the account (M27).
 */
export function libraryView(
  items: readonly (LibraryItem & { status: LibraryStatus })[] | null,
  filter: LibraryFilter,
  query: string,
  actions: LibraryViewActions,
  synced = false,
  rooms: readonly LibraryRoomItem[] | null = null,
) {
  const shown = items?.filter((item) => matchesFilter(item.status, filter) && matchesTitle(item.record.doc.meta.title || t("untitled"), query)) ?? null;
  return html`
    <header class="page-head with-action">
      <h1>${t("library")}</h1>
      <button class="compact" @click=${actions.openBuild}>${icon("plus", 18)}${t("libraryNewShort")}</button>
    </header>
    ${items !== null && items.length > 0
      ? searchField({
          id: "library-search",
          label: t("librarySearchLabel"),
          placeholder: t("librarySearchPlaceholder"),
          value: query,
          onInput: actions.setQuery,
          onSubmit: actions.setQuery,
          extraClass: "library-search",
        })
      : nothing}
    ${items !== null && items.length > 0
      ? html`<div class="chips library-filter" role="group" aria-label=${t("libraryFilter")}>
          ${LIBRARY_FILTERS.map((f) => chip(t(FILTER_TEXT[f]), f === filter, () => actions.setFilter(f)))}
        </div>`
      : nothing}
    ${shown === null
      ? html`<p role="status">${t("loading")}</p>`
      : shown.length === 0
        ? html`<p class="empty">
            ${items!.length === 0 ? t("libraryEmpty") : query.trim() ? t("librarySearchEmpty", { q: query.trim() }) : t(EMPTY_TEXT[filter])}
          </p>`
        : html`<ul class="card-list">${shown.map((item) => libraryEntry(item, actions))}</ul>`}
    <p class="info-box">${icon("info", 18)}<span>${t(synced ? "librarySyncedHint" : "libraryLocalHint")}</span></p>
    ${roomsSection(rooms, actions)}
  `;
}

/** Own escape rooms (M45, synced since M48): not filtered or searched with the puzzles. */
function roomsSection(rooms: readonly LibraryRoomItem[] | null, actions: LibraryViewActions) {
  return html`<section class="library-rooms" aria-labelledby="library-rooms">
    <div class="section-head with-action">
      <h2 id="library-rooms">${t("libraryRooms")}</h2>
      <button class="compact secondary" @click=${actions.newRoom}>${icon("plus", 18)}${t("libraryNewRoom")}</button>
    </div>
    ${rooms === null
      ? html`<p role="status">${t("loading")}</p>`
      : rooms.length === 0
        ? html`<p class="empty">${t("libraryRoomsEmpty")}</p>`
        : html`<ul class="card-list">
              ${rooms.map((room) => {
                const title = room.title || t("untitled");
                const updated = timeAgo(room.updatedAt, Date.now());
                const menu: MenuItem[] = [
                  { icon: "pencil", text: t("edit"), href: `#/room-edit/${room.id}` },
                  ...(room.verified ? [{ icon: "play", text: t("play"), href: `#/room/${room.id}` } as const] : []),
                  { icon: "trash", text: t("delete"), danger: true, onClick: () => confirm(t("confirmDelete", { title })) && actions.removeRoom(room.id) },
                ];
                return html`<li class="library-card">
                  <span class="library-card-icon" aria-hidden="true">${icon("door", 22)}</span>
                  <div class="library-card-body">
                    <a class="library-card-link" href="#/room-edit/${room.id}">${title}</a>
                    <span class="library-card-sub">${t("roomEdKicker")}${updated ? html` · ${t("libraryEdited", { when: updated })}` : nothing}</span>
                    <span>${statusBadge(room.status)}</span>
                  </div>
                  ${popoverMenu(`room-menu-${room.id}`, t("libraryMenu", { title }), menu, "icon-button quiet-icon")}
                </li>`;
              })}
            </ul>`}
  </section>`;
}

function libraryEntry({ record, type, playable, status }: LibraryItem & { status: LibraryStatus }, actions: LibraryViewActions) {
  const { meta } = record.doc;
  const title = meta.title || t("untitled");
  const updated = timeAgo(record.updatedAt, Date.now());
  const menu: MenuItem[] = [
    { icon: "pencil", text: t("edit"), href: `#/edit/${record.id}` },
    ...(playable ? [{ icon: "play", text: t("play"), href: `#/play/${record.id}` } as const] : []),
    { icon: "copy", text: t("duplicate"), onClick: () => actions.duplicate(record.id) },
    { icon: "trash", text: t("delete"), danger: true, onClick: () => confirm(t("confirmDelete", { title })) && actions.remove(record.id) },
  ];
  return html`
    <li class="library-card">
      ${thumb(type, "list", parseTheme(meta.theme), { source: record.doc, draft: true })}
      <div class="library-card-body">
        <a class="library-card-link" href="#/edit/${record.id}">${title}</a>
        <span class="library-card-sub">
          <span class="type-name typed" style=${typeVars(type)}>${t(type.name)}</span>
          ${updated ? html` · ${t("libraryEdited", { when: updated })}` : nothing}
          ${meta.minMoves === undefined ? nothing : html` · ${tn("galleryMinMoves", meta.minMoves)}`}
        </span>
        <span>${statusBadge(status)}</span>
      </div>
      ${popoverMenu(`menu-${record.id}`, t("libraryMenu", { title }), menu, "icon-button quiet-icon")}
    </li>
  `;
}
