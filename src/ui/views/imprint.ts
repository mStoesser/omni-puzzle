import { html } from "lit-html";
import { t } from "../../i18n/t.ts";
import { backHeader } from "../components/ui.ts";
import { imprint, imprintComplete } from "../../imprint.ts";

export function imprintView() {
  return html`
    ${backHeader("#/", t("imprint"))}
    ${imprintComplete()
      ? html`
          <h2>${t("imprintLaw")}</h2>
          <address class="imprint">
            ${imprint.name}<br />
            ${imprint.street}<br />
            ${imprint.city}
          </address>
          <h2>${t("imprintContact")}</h2>
          <p><a href="mailto:${imprint.email}">${imprint.email}</a></p>
        `
      : html`<p>${t("imprintMissing")}</p>`}
    <p><a href="#/datenschutz">${t("imprintPrivacyLink")}</a></p>
  `;
}
