import { html } from "lit-html";
import { shortcutRows } from "../../core/shortcuts.ts";
import type { ShortcutContext } from "../../core/shortcuts.ts";
import { t } from "../../i18n/t.ts";
import { icon } from "../icons.ts";
import { isMac } from "../keyboard.ts";
import { sheet } from "./ui.ts";

/** Overview of the keyboard shortcuts (M33), opened with "?" or the button next to the board. */
export function shortcutsDialog(context: ShortcutContext, undo: boolean, close: () => void) {
  const rows = shortcutRows(context, isMac(), t("keyCtrl"), undo);
  return sheet(
    "shortcuts-title",
    close,
    html`<div class="sheet-head">
        <h2 id="shortcuts-title" class="sheet-title">${t("shortcutsTitle")}</h2>
        <button class="icon-button" aria-label=${t("close")} @click=${close}>${icon("close", 20)}</button>
      </div>
      <dl class="shortcut-list">
        ${rows.map(
          (row) => html`<div class="shortcut-row">
            <dt>${t(row.label)}</dt>
            <dd>
              ${row.combos.map(
                (combo, i) => html`${i > 0 ? html`<span class="shortcut-or">/</span>` : ""}<span class="shortcut-combo"
                    >${combo.map((key) => html`<kbd>${key}</kbd>`)}</span
                  >`,
              )}
            </dd>
          </div>`,
        )}
      </dl>
      <p class="hint">${t("shortcutsNote")}</p>`,
    "shortcuts-sheet",
  );
}

/** Button that opens the overview; shown only with a fine pointer that can hover (likely a keyboard), see .kbd-only. */
export function shortcutsButton(open: () => void) {
  return html`<button type="button" class="quiet kbd-only shortcuts-open" aria-label=${t("shortcutsOpen")} aria-keyshortcuts="?" @click=${open}>
    ${icon("info", 18)}${t("shortcutsTitle")}<kbd aria-hidden="true">?</kbd>
  </button>`;
}
