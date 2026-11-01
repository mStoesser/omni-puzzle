import { html } from "lit-html";
import { t } from "../../i18n/t.ts";
import type { MessageKey } from "../../i18n/t.ts";
import { imprint } from "../../imprint.ts";
import { privacy } from "../../privacy.ts";

const DATE_FORMAT = new Intl.DateTimeFormat("de-DE", { dateStyle: "long" });

/** `withBackend` adds the sections about accounts and community features. */
export function privacyView(withBackend: boolean) {
  const section = (heading: MessageKey, text: string) => html`<h2>${t(heading)}</h2><p>${text}</p>`;
  return html`
    <header class="toolbar">
      <a class="button secondary" href="#/" aria-label=${t("back")}>←</a>
      <h1 class="toolbar-title">${t("privacyTitle")}</h1>
    </header>
    <p class="hint">${t("privacyUpdated", { date: DATE_FORMAT.format(new Date(privacy.updated)) })}</p>
    <h2>${t("privacyControllerHeading")}</h2>
    <p>${t("privacyController")}</p>
    <address class="imprint">
      ${imprint.name}<br />
      ${imprint.street}<br />
      ${imprint.city}<br />
      <a href="mailto:${imprint.email}">${imprint.email}</a>
    </address>
    ${section("privacyHostingHeading", t("privacyHosting"))}
    ${section("privacyLocalHeading", t("privacyLocal"))}
    ${section("privacyLinksHeading", t("privacyLinks"))}
    ${withBackend
      ? html`
          ${section("privacyAccountHeading", t("privacyAccount"))}
          ${section("privacyPublicHeading", t("privacyPublic"))}
          ${section("privacyTokenHeading", t("privacyToken"))}
          ${privacy.mailProvider ? section("privacyMailHeading", t("privacyMail", { provider: privacy.mailProvider })) : null}
          ${section("privacyDeletionHeading", t("privacyDeletion"))}
        `
      : null}
    ${section("privacyRightsHeading", t("privacyRights"))}
  `;
}
