import { html, nothing } from "lit-html";
import type { ChainItem } from "../../core/chains.ts";
import type { GalleryItem } from "../../core/gallery.ts";
import { averageRating, formatAverage } from "../../core/reactions.ts";
import type { PuzzleTheme } from "../../core/puzzle-theme.ts";
import type { AnyPuzzleType } from "../../core/types.ts";
import { t, tn } from "../../i18n/t.ts";
import { icon, iconSvg, ICONS } from "../icons.ts";
import { timeAgo } from "../time.ts";
import { langBadge, statusBadge, typeBadge, typeVars } from "./ui.ts";

/**
 * Placeholder preview: a grid with the type symbol. The puzzles themselves are only rendered when played.
 * With a theme (M29) the grid takes the board's colors, and two parts show the piece and target colors.
 */
export function thumb(type: AnyPuzzleType | undefined, size: "list" | "tile", theme?: PuzzleTheme | null) {
  const colors = theme && type?.themeRoles ? theme.colors : null;
  const style = colors
    ? `${typeVars(type)};--thumb-board:${colors.board};--thumb-line:${colors.line};--thumb-piece:${colors.piece};--thumb-target:${colors.target}`
    : typeVars(type);
  return html`<span class="thumb ${size} typed ${colors ? "themed" : ""}" style=${style} aria-hidden="true">
    <span class="thumb-icon">${iconSvg(type?.icon ?? ICONS.puzzle, 14)}</span>
    ${colors ? html`<span class="thumb-part piece"></span><span class="thumb-part target"></span>` : nothing}
  </span>`;
}

function author(item: GalleryItem) {
  return item.author === null ? t("galleryByUnknown") : t("galleryBy", { author: item.author });
}

function likes(item: GalleryItem) {
  return html`<span class="meta-item">${icon("heart", 14)}<span aria-hidden="true">${item.likeCount}</span
    ><span class="visually-hidden">${tn("galleryLikes", item.likeCount)}</span></span>`;
}

/** A published puzzle as a list row (gallery). The whole card is a link. */
export function galleryCard(item: GalleryItem, type: AnyPuzzleType | undefined, solved: boolean) {
  const average = averageRating(item.ratingSum, item.ratingCount);
  return html`<a class="puzzle-card" href="#/g/${item.id}">
    ${thumb(type, "list", item.theme)}
    <span class="puzzle-card-body">
      <span class="puzzle-card-badges">${typeBadge(type, item.type)}${item.lang ? langBadge(item.lang) : nothing}${solved ? statusBadge("solved") : nothing}</span>
      <span class="puzzle-card-title">${item.title}</span>
      <span class="puzzle-card-sub">${[author(item), timeAgo(item.publishedAt, Date.now())].filter(Boolean).join(" · ")}</span>
      <span class="puzzle-card-meta">
        ${likes(item)}
        <span class="meta-item">${icon("play", 12)}<span aria-hidden="true">${item.playCount}</span
          ><span class="visually-hidden">${tn("galleryPlays", item.playCount)}</span></span>
        ${item.level ? html`<span class="meta-item">${t(`level${item.level}`)}</span>` : nothing}
        ${item.minMoves !== null ? html`<span class="meta-item">${tn("galleryMinMoves", item.minMoves)}</span>` : nothing}
        ${average === null
          ? nothing
          : html`<span class="meta-item"><span aria-hidden="true">Ø ${formatAverage(average)}</span
              ><span class="visually-hidden">${t("galleryRating", { average: formatAverage(average) })}</span></span>`}
      </span>
    </span>
  </a>`;
}

/** A published puzzle as a grid tile (home page). */
export function galleryTile(item: GalleryItem, type: AnyPuzzleType | undefined, solved: boolean) {
  return html`<a class="puzzle-tile" href="#/g/${item.id}">
    ${thumb(type, "tile", item.theme)}
    <span class="puzzle-tile-body">
      <span class="puzzle-tile-type typed" style=${typeVars(type)}>${type ? t(type.name) : item.type}</span>
      <span class="puzzle-card-title">${item.title}</span>
      <span class="puzzle-card-sub">${author(item)}</span>
      <span class="puzzle-card-meta">
        ${likes(item)}
        <span class="meta-item">${tn("galleryPlays", item.playCount)}</span>
        ${solved ? html`<span class="meta-item ok">${icon("check", 14)}${t("solvedMark")}</span>` : nothing}
      </span>
    </span>
  </a>`;
}

/** A chain as a list row (gallery): number of puzzles and how many of them were solved on this device. */
export function chainCard(item: ChainItem, solvedCount: number) {
  const total = item.stepKeys.length;
  return html`<a class="puzzle-card" href="#/c/${item.id}">
    <span class="thumb list chain-thumb" aria-hidden="true"><span class="thumb-icon">${icon("chain", 14)}</span></span>
    <span class="puzzle-card-body">
      <span class="puzzle-card-badges">
        <span class="badge badge-chain">${icon("chain", 14)}${tn("chainSteps", total)}</span>
        ${solvedCount > 0 && solvedCount >= total ? statusBadge("solved") : nothing}
      </span>
      <span class="puzzle-card-title">${item.title}</span>
      <span class="puzzle-card-sub">${[item.author === null ? t("galleryByUnknown") : t("galleryBy", { author: item.author }), timeAgo(item.publishedAt, Date.now())].filter(Boolean).join(" · ")}</span>
      <span class="puzzle-card-meta">
        <span class="meta-item">${icon("play", 12)}<span aria-hidden="true">${item.playCount}</span
          ><span class="visually-hidden">${tn("galleryPlays", item.playCount)}</span></span>
        ${solvedCount > 0 && solvedCount < total
          ? html`<span class="meta-item">${t("chainProgress", { solved: solvedCount, total })}</span>`
          : nothing}
      </span>
    </span>
  </a>`;
}
