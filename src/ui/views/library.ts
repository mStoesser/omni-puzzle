import { html, nothing } from "lit-html";
import type { PuzzleRecord } from "../../core/storage.ts";
import type { AnyPuzzleType } from "../../core/types.ts";
import { t } from "../../i18n/t.ts";
import { thumb } from "../components/gallery-card.ts";
import { popoverMenu, statusBadge, typeVars } from "../components/ui.ts";
import type { MenuItem } from "../components/ui.ts";
import { icon } from "../icons.ts";
import { timeAgo } from "../time.ts";

export type LibraryItem = {
  record: PuzzleRecord;
  type: AnyPuzzleType;
  playable: boolean;
};

export type LibraryViewActions = {
  duplicate(id: string): void;
  remove(id: string): void;
  openBuild(): void;
};

/** `items` null = still loading. `synced`: signed in, so the library is synced with the account (M27). */
export function libraryView(items: readonly LibraryItem[] | null, actions: LibraryViewActions, synced = false) {
  return html`
    <header class="page-head with-action">
      <h1>${t("library")}</h1>
      <button class="compact" @click=${actions.openBuild}>${icon("plus", 18)}${t("libraryNewShort")}</button>
    </header>
    ${items === null
      ? html`<p role="status">${t("loading")}</p>`
      : items.length === 0
        ? html`<p class="empty">${t("libraryEmpty")}</p>`
        : html`<ul class="card-list">${items.map((item) => libraryEntry(item, actions))}</ul>`}
    <p class="info-box">${icon("info", 18)}<span>${t(synced ? "librarySyncedHint" : "libraryLocalHint")}</span></p>
  `;
}

function libraryEntry({ record, type, playable }: LibraryItem, actions: LibraryViewActions) {
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
      ${thumb(type, "list")}
      <div class="library-card-body">
        <a class="library-card-link" href="#/edit/${record.id}">${title}</a>
        <span class="library-card-sub">
          <span class="type-name typed" style=${typeVars(type)}>${t(type.name)}</span>
          ${updated ? html` · ${t("libraryEdited", { when: updated })}` : nothing}
          ${meta.minMoves === undefined ? nothing : html` · ${(meta.minMoves === 1 ? t("galleryMinMovesOne") : t("galleryMinMoves", { moves: meta.minMoves }))}`}
        </span>
        <span>${statusBadge(meta.verified ? "ready" : "draft")}</span>
      </div>
      ${popoverMenu(`menu-${record.id}`, t("libraryMenu", { title }), menu, "icon-button quiet-icon")}
    </li>
  `;
}
