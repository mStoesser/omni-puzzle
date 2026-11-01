import { html } from "lit-html";
import { t } from "../../i18n/t.ts";
import { imprint, imprintComplete } from "../../imprint.ts";

export function imprintView() {
  return html`
    <header class="toolbar">
      <a class="button secondary" href="#/" aria-label=${t("back")}>←</a>
      <h1 class="toolbar-title">${t("imprint")}</h1>
    </header>
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
