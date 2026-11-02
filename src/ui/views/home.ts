import { html } from "lit-html";
import { formatRoute } from "../../core/router.ts";
import { DEFAULT_FILTER } from "../../core/gallery.ts";
import type { GalleryItem } from "../../core/gallery.ts";
import type { AnyPuzzleType } from "../../core/types.ts";
import { galleryCard } from "../components/gallery-card.ts";
import { t } from "../../i18n/t.ts";
import type { Example } from "../../puzzles/index.ts";

/** Account link on the home page; `username` null = signed out. */
export type AccountBadge = { username: string | null };

/** The newest published puzzles (empty while loading or on errors); `solved` checks local progress by content key. */
export type HomeGallery = { newest: readonly GalleryItem[]; solved(contentKey: string): boolean };

/** `solvedExamples` = ids of examples the player has solved; `account` and `gallery` null = no backend. */
export function homeView(
  types: readonly AnyPuzzleType[],
  examples: readonly Example[],
  solvedExamples: ReadonlySet<string>,
  account: AccountBadge | null,
  gallery: HomeGallery | null,
) {
  return html`
    <header class="home-head">
      <h1>${t("appTitle")}</h1>
      ${account
        ? html`<a class="button secondary account-badge" href="#/account">
            ${account.username === null ? t("accountLink") : html`<span aria-hidden="true">👤</span><span class="visually-hidden">${t("account")}:</span> ${account.username}`}
          </a>`
        : null}
    </header>
    <p>${t("homeIntro")}</p>
    ${gallery ? newInGallery(gallery, types) : null}
    ${types.length === 0
      ? html`<p>${t("homeNoTypes")}</p>`
      : types.map((type) => typeTile(type, examples, solvedExamples, gallery !== null))}
    <h2>${t("library")}</h2>
    <a class="card" href="#/library">
      <span class="card-icon" aria-hidden="true">📚</span>
      <span class="card-title">${t("libraryOpen")}</span>
      <span class="card-detail" aria-hidden="true">›</span>
    </a>
    ${siteFooter()}
  `;
}

function newInGallery(gallery: HomeGallery, types: readonly AnyPuzzleType[]) {
  return html`
    <section class="home-gallery" aria-labelledby="home-gallery">
      <h2 id="home-gallery">${t("homeNewInGallery")}</h2>
      ${gallery.newest.length === 0
        ? null
        : html`<ul class="card-list">
            ${gallery.newest.map(
              (item) => html`<li>${galleryCard(item, types.find((type) => type.id === item.type), gallery.solved(item.contentKey))}</li>`,
            )}
          </ul>`}
      <a class="card" href="#/gallery">
        <span class="card-icon" aria-hidden="true">🧩</span>
        <span class="card-title">${t("homeGalleryAll")}</span>
        <span class="card-detail" aria-hidden="true">›</span>
      </a>
    </section>
  `;
}

function typeTile(type: AnyPuzzleType, examples: readonly Example[], solved: ReadonlySet<string>, withGallery: boolean) {
  const own = examples.filter((e) => e.doc.type === type.id);
  const headingId = `type-${type.id}`;
  return html`
    <section class="type-tile" aria-labelledby=${headingId}>
      <div class="type-head">
        <span class="type-icon" aria-hidden="true">${type.icon}</span>
        <div>
          <h2 id=${headingId}>${t(type.name)}</h2>
          <p>${t(type.description)}</p>
        </div>
      </div>
      ${own.length === 0
        ? null
        : html`
            <ul class="card-list">
              ${own.map(
                ({ id, doc }) => html`
                  <li>
                    <a class="card compact" href="#/play/${id}">
                      <span class="card-title">${doc.meta.title}</span>
                      <span class="card-detail">
                        ${solved.has(id)
                          ? html`<span class="badge-ok">${t("solvedMark")}</span>`
                          : doc.meta.minMoves === undefined
                            ? null
                            : t("minMovesHint", { moves: doc.meta.minMoves })}
                      </span>
                    </a>
                  </li>
                `,
              )}
            </ul>
          `}
      <div class="type-actions">
        <a class="button secondary" href="#/new/${type.id}">＋ ${t("build")}</a>
        ${withGallery
          ? html`<a class="button secondary" href=${formatRoute({ name: "gallery", filter: { ...DEFAULT_FILTER, type: type.id } })}>
              ${t("typeGallery")}
            </a>`
          : null}
      </div>
    </section>
  `;
}

export function siteFooter() {
  return html`<footer class="site-footer">
    <a href="#/impressum">${t("imprint")}</a>
    <a href="#/datenschutz">${t("privacy")}</a>
  </footer>`;
}
