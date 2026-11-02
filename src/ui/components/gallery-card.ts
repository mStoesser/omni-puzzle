import { html, nothing } from "lit-html";
import type { GalleryItem } from "../../core/gallery.ts";
import { averageRating, formatAverage } from "../../core/reactions.ts";
import type { AnyPuzzleType } from "../../core/types.ts";
import { t } from "../../i18n/t.ts";

/** A published puzzle in the gallery or on the home page. `type` is undefined for types this app does not know. */
export function galleryCard(item: GalleryItem, type: AnyPuzzleType | undefined, solved: boolean) {
  const average = averageRating(item.ratingSum, item.ratingCount);
  const facts = [
    type ? t(type.name) : item.type,
    item.author === null ? t("galleryByUnknown") : t("galleryBy", { author: item.author }),
    ...(item.level ? [t(`level${item.level}`)] : []),
  ];
  return html`<a class="card gallery-card" href="#/g/${item.id}">
    <span class="card-icon" aria-hidden="true">${type?.icon ?? "🧩"}</span>
    <span class="gallery-card-body">
      <span class="card-title">${item.title}</span>
      <span class="card-detail">${facts.join(" · ")}</span>
    </span>
    <span class="card-detail gallery-card-stats">
      ${solved ? html`<span class="badge-ok">${t("solvedMark")}</span>` : nothing}
      <span><span aria-hidden="true">♥ ${item.likeCount}</span><span class="visually-hidden">${t("galleryLikes", { count: item.likeCount })}</span></span>
      ${average === null
        ? nothing
        : html`<span><span aria-hidden="true">Ø ${formatAverage(average)}</span><span class="visually-hidden">${t("galleryRating", { average: formatAverage(average) })}</span></span>`}
    </span>
  </a>`;
}
