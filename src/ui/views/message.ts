import { html } from "lit-html";
import { t } from "../../i18n/t.ts";

export function messageView(text: string) {
  return html`
    <p>${text}</p>
    <a class="button" href="#/">${t("toHome")}</a>
  `;
}
