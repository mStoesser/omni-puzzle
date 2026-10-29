import { html } from "lit-html";
import { t } from "../../i18n/t.ts";
import type { MessageKey } from "../../i18n/t.ts";

export function messageView(text: string, action: { href: string; label: MessageKey } = { href: "#/", label: "toHome" }) {
  return html`
    <p>${text}</p>
    <a class="button" href=${action.href}>${t(action.label)}</a>
  `;
}
