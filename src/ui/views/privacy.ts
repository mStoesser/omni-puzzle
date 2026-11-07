import { html } from "lit-html";
import { perLocale, t } from "../../i18n/t.ts";
import { backHeader } from "../components/ui.ts";
import type { MessageKey } from "../../i18n/t.ts";
import { imprint } from "../../imprint.ts";
import { privacy } from "../../privacy.ts";

const dateFormat = perLocale((tag) => new Intl.DateTimeFormat(tag, { dateStyle: "long" }));

/** `withBackend` adds the sections about accounts and community features. */
export function privacyView(withBackend: boolean) {
  const section = (heading: MessageKey, text: string) => html`<h2>${t(heading)}</h2><p>${text}</p>`;
  return html`
    ${backHeader("#/", t("privacyTitle"))}
    ${t("legalTranslation") ? html`<p class="hint">${t("legalTranslation")}</p>` : null}
    <p class="hint">${t("privacyUpdated", { date: dateFormat().format(new Date(privacy.updated)) })}</p>
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
