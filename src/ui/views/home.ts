import { html } from "lit-html";
import type { AnyPuzzleType } from "../../core/types.ts";
import { t } from "../../i18n/t.ts";
import type { Example } from "../../puzzles/index.ts";

/** `solvedExamples` = ids of examples the player has solved. */
export function homeView(
  types: readonly AnyPuzzleType[],
  examples: readonly Example[],
  solvedExamples: ReadonlySet<string>,
) {
  const iconOf = (typeId: string) => types.find((type) => type.id === typeId)?.icon ?? "";
  return html`
    <h1>${t("appTitle")}</h1>
    <p>${t("homeIntro")}</p>
    ${types.length === 0
      ? html`<p>${t("homeNoTypes")}</p>`
      : html`
          <h2>${t("examples")}</h2>
          <ul class="card-list">
            ${examples.map(
              ({ id, doc }) => html`
                <li>
                  <a class="card" href="#/play/${id}">
                    <span class="card-icon" aria-hidden="true">${iconOf(doc.type)}</span>
                    <span class="card-title">${doc.meta.title}</span>
                    <span class="card-detail">
                      ${solvedExamples.has(id)
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
          <h2>${t("build")}</h2>
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
          <h2>${t("library")}</h2>
          <ul class="card-list">
            <li>
              <a class="card" href="#/library">
                <span class="card-icon" aria-hidden="true">📚</span>
                <span class="card-title">${t("libraryOpen")}</span>
                <span class="card-detail" aria-hidden="true">›</span>
              </a>
            </li>
          </ul>
        `}
  `;
}
