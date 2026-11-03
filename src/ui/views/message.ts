import { html, nothing } from "lit-html";
import { t } from "../../i18n/t.ts";
import type { MessageKey } from "../../i18n/t.ts";

/** A message with a link (home by default); `reload` adds a button that loads the newest app version. */
export function messageView(text: string, action: { href: string; label: MessageKey } = { href: "#/", label: "toHome" }, reload = false) {
  // The service worker fetches the network first, so a reload online brings the newest version.
  const offline = reload && !navigator.onLine;
  return html`
    <p>${text}</p>
    ${offline ? html`<p class="hint">${t("reloadOffline")}</p>` : nothing}
    <div class="message-actions">
      ${reload ? html`<button @click=${() => location.reload()}>${t("reload")}</button>` : nothing}
      <a class="button ${reload ? "secondary" : ""}" href=${action.href}>${t(action.label)}</a>
    </div>
  `;
}
