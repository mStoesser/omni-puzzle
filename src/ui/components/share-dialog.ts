import { html, nothing } from "lit-html";
import { ref } from "lit-html/directives/ref.js";
import { t } from "../../i18n/t.ts";
import { showModal } from "./dialog.ts";

/** Messengers may cut off longer links. */
export const RECOMMENDED_LINK_LENGTH = 2000;

export type ShareDialogModel = {
  title: string;
  url: string | null; // null = still encoding
  copy: "idle" | "copied" | "failed";
};

export type ShareDialogActions = {
  copied(ok: boolean): void;
  close(): void;
};

export function shareDialog(model: ShareDialogModel, actions: ShareDialogActions) {
  const { url } = model;
  // navigator.share and the clipboard API only exist in secure contexts (https, localhost).
  const canShare = typeof navigator.share === "function";
  return html`
    <dialog class="dialog" ${ref(showModal)} @close=${actions.close} aria-labelledby="share-title">
      <h2 id="share-title">${t("shareTitle")}</h2>
      ${url === null
        ? html`<p>${t("shareCreating")}</p>`
        : html`
            <label class="field">
              <span>${t("shareLink")}</span>
              <input
                type="text"
                readonly
                class="share-link"
                .value=${url}
                @focus=${(e: Event) => (e.target as HTMLInputElement).select()}
              />
            </label>
            <p>${t("shareLength", { length: url.length })}</p>
            ${url.length > RECOMMENDED_LINK_LENGTH ? html`<p class="status-problem">${t("shareTooLong")}</p>` : nothing}
            ${model.copy === "failed" ? html`<p class="status-problem">${t("shareCopyFailed")}</p>` : nothing}
          `}
      <div class="dialog-actions">
        <button class="secondary" @click=${actions.close}>${t("close")}</button>
        <button class="secondary" ?disabled=${url === null} @click=${(e: Event) => copy(e, url!, actions)}>
          ${model.copy === "copied" ? t("shareCopied") : t("shareCopy")}
        </button>
        ${canShare
          ? html`<button ?disabled=${url === null} @click=${() => share(model.title, url!)}>${t("share")}</button>`
          : nothing}
      </div>
    </dialog>
  `;
}

async function share(title: string, url: string) {
  try {
    await navigator.share({ title, text: t("shareText"), url });
  } catch {
    // Cancelled by the user or not allowed; the link stays visible in the dialog.
  }
}

async function copy(event: Event, url: string, actions: ShareDialogActions) {
  const dialog = (event.target as Element).closest("dialog");
  try {
    if (!navigator.clipboard) throw new Error("no clipboard");
    await navigator.clipboard.writeText(url);
    actions.copied(true);
  } catch {
    // Fallback for insecure contexts (e.g. the dev server on the LAN): copy the selected input.
    const input = dialog?.querySelector<HTMLInputElement>(".share-link");
    input?.select();
    actions.copied(input !== null && input !== undefined && document.execCommand("copy"));
  }
}
