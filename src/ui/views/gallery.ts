import { html, nothing } from "lit-html";
import { LEVELS } from "../../core/difficulty.ts";
import { GALLERY_SORTS } from "../../core/gallery.ts";
import type { GalleryFilter, GalleryItem, GallerySort } from "../../core/gallery.ts";
import type { Registry } from "../../core/registry.ts";
import { t } from "../../i18n/t.ts";
import type { MessageKey } from "../../i18n/t.ts";
import { galleryCard } from "../components/gallery-card.ts";
import { chip } from "../components/ui.ts";
import { icon } from "../icons.ts";

export type GalleryViewModel = {
  filter: GalleryFilter;
  items: GalleryItem[]; // loaded so far
  status: "loading" | "idle" | "loading-more" | "error";
  error: MessageKey | null;
  hasMore: boolean;
  announcement: string; // live region text after loading more
};

export type GalleryViewActions = {
  setFilter(filter: GalleryFilter): void;
  loadMore(): void;
  retry(): void;
};

const SORT_TEXT: Record<GallerySort, MessageKey> = {
  new: "gallerySortNew",
  likes: "gallerySortLikes",
  plays: "gallerySortPlays",
  hardest: "gallerySortHardest",
};

/** `solved(contentKey)` tells whether the puzzle was solved on this device. */
export function galleryView(
  model: GalleryViewModel,
  registry: Registry,
  solved: (contentKey: string) => boolean,
  actions: GalleryViewActions,
) {
  const { filter } = model;
  const filtered = filter.type !== null || filter.level !== null;
  const loaded = model.status !== "loading";
  return html`
    <header class="page-head">
      <h1>${t("gallery")}</h1>
      <p>${t("galleryIntro")}</p>
    </header>

    <div class="chips" role="group" aria-label=${t("galleryType")}>
      ${chip(t("galleryChipAll"), filter.type === null, () => actions.setFilter({ ...filter, type: null }))}
      ${registry.all().map((type) =>
        chip(t(type.name), filter.type === type.id, () => actions.setFilter({ ...filter, type: type.id }), type),
      )}
    </div>

    <div class="list-bar">
      <span class="list-count" role="status">
        ${loaded && model.status !== "error"
          ? t(model.hasMore ? "galleryCountMore" : "galleryCount", { count: model.items.length })
          : nothing}
      </span>
      ${select(t("galleryLevel"), String(filter.level ?? ""), [["", t("galleryAllLevels")], ...LEVELS.map((l) => [String(l), t(`level${l}`)] as const)], (value) =>
        actions.setFilter({ ...filter, level: value ? (Number(value) as GalleryFilter["level"]) : null }),
      )}
      ${select(t("gallerySort"), filter.sort, GALLERY_SORTS.map((s) => [s, t(SORT_TEXT[s])] as const), (value) =>
        actions.setFilter({ ...filter, sort: value as GallerySort }),
      )}
    </div>

    ${model.status === "loading"
      ? html`<p role="status">${t("loading")}</p>`
      : html`
          ${model.items.length === 0 && model.status !== "error"
            ? html`<p class="empty">${filtered ? t("galleryEmptyFiltered") : t("galleryEmpty")}</p>`
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
