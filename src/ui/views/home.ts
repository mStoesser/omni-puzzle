import { html } from "lit-html";
import type { AnyPuzzleType } from "../../core/types.ts";
import { t } from "../../i18n/t.ts";
import type { Example } from "../../puzzles/index.ts";

export function homeView(types: readonly AnyPuzzleType[], examples: readonly Example[]) {
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
                    ${doc.meta.minMoves === undefined
                      ? null
                      : html`<span class="card-detail">${t("minMovesHint", { moves: doc.meta.minMoves })}</span>`}
                  </a>
                </li>
              `,
            )}
          </ul>
        `}
  `;
}
