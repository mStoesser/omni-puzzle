import { html } from "lit-html";
import type { AnyPuzzleType } from "../../core/types.ts";
import { t } from "../../i18n/t.ts";
import type { Example } from "../../puzzles/index.ts";

/** Account link on the home page; `username` null = signed out. */
export type AccountBadge = { username: string | null };

/** `solvedExamples` = ids of examples the player has solved; `account` null = no backend. */
export function homeView(
  types: readonly AnyPuzzleType[],
  examples: readonly Example[],
  solvedExamples: ReadonlySet<string>,
  account: AccountBadge | null,
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
    ${types.length === 0 ? html`<p>${t("homeNoTypes")}</p>` : types.map((type) => typeTile(type, examples, solvedExamples))}
    <h2>${t("library")}</h2>
    <a class="card" href="#/library">
      <span class="card-icon" aria-hidden="true">📚</span>
      <span class="card-title">${t("libraryOpen")}</span>
      <span class="card-detail" aria-hidden="true">›</span>
    </a>
    ${siteFooter()}
  `;
}

function typeTile(type: AnyPuzzleType, examples: readonly Example[], solved: ReadonlySet<string>) {
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
      <a class="button secondary type-build" href="#/new/${type.id}">＋ ${t("build")}</a>
    </section>
  `;
}

export function siteFooter() {
  return html`<footer class="site-footer">
    <a href="#/impressum">${t("imprint")}</a>
    <a href="#/datenschutz">${t("privacy")}</a>
  </footer>`;
}
