import { html } from "lit-html";
import type { AnyPuzzleType } from "../../core/types.ts";
import { t } from "../../i18n/t.ts";

export function homeView(types: readonly AnyPuzzleType[]) {
  return html`
    <h1>${t("appTitle")}</h1>
    <p>${t("homeIntro")}</p>
    ${types.length === 0
      ? html`<p>${t("homeNoTypes")}</p>`
      : html`<ul class="type-list">
          ${types.map((type) => html`<li><span aria-hidden="true">${type.icon}</span> ${t(type.name)}</li>`)}
        </ul>`}
  `;
}
