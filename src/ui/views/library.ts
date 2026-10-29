import { html, nothing } from "lit-html";
import type { PuzzleRecord } from "../../core/storage.ts";
import type { AnyPuzzleType } from "../../core/types.ts";
import { t } from "../../i18n/t.ts";

export type LibraryItem = {
  record: PuzzleRecord;
  type: AnyPuzzleType;
  playable: boolean;
};

export type LibraryViewActions = {
  duplicate(id: string): void;
  remove(id: string): void;
};

const DATE_FORMAT = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" });

/** `items` null = still loading. */
export function libraryView(items: readonly LibraryItem[] | null, types: readonly AnyPuzzleType[], actions: LibraryViewActions) {
  return html`
    <header class="toolbar">
      <a class="button secondary" href="#/" aria-label=${t("back")}>←</a>
      <h1 class="toolbar-title">${t("library")}</h1>
    </header>
    ${items === null
      ? html`<p>${t("loading")}</p>`
      : items.length === 0
        ? html`<p>${t("libraryEmpty")}</p>`
        : html`<ul class="card-list">${items.map((item) => libraryEntry(item, actions))}</ul>`}
    <h2>${t("libraryNew")}</h2>
    <ul class="card-list">
      ${types.map(
        (type) => html`
          <li>
            <a class="card" href="#/new/${type.id}">
              <span class="card-icon" aria-hidden="true">${type.icon}</span>
              <span class="card-title">${t(type.name)}</span>
              <span class="card-detail" aria-hidden="true">＋</span>
            </a>
          </li>
        `,
      )}
    </ul>
  `;
}

function libraryEntry({ record, type, playable }: LibraryItem, actions: LibraryViewActions) {
  const { meta } = record.doc;
  const title = meta.title || t("untitled");
  const updated = new Date(record.updatedAt);
  return html`
    <li class="library-item">
      <div class="library-head">
        <span class="card-icon" aria-hidden="true">${type.icon}</span>
        <span>
          <span class="card-title">${title}</span>
          <span class="card-detail">
            ${meta.verified ? html`<span class="badge-ok">${t("libraryVerified")}</span>` : t("libraryDraft")}
            ${meta.minMoves === undefined ? nothing : html` · ${t("minMovesHint", { moves: meta.minMoves })}`}
            ${Number.isNaN(updated.getTime()) ? nothing : html` · ${t("libraryUpdated", { date: DATE_FORMAT.format(updated) })}`}
          </span>
        </span>
      </div>
      <div class="library-actions">
        <a class="button" href="#/edit/${record.id}">${t("edit")}</a>
        ${playable ? html`<a class="button secondary" href="#/play/${record.id}">${t("play")}</a>` : nothing}
        <button class="secondary" @click=${() => actions.duplicate(record.id)}>${t("duplicate")}</button>
        <button class="secondary danger" @click=${() => confirm(t("confirmDelete", { title })) && actions.remove(record.id)}>
          ${t("delete")}
        </button>
      </div>
    </li>
  `;
}
