import { html, nothing } from "lit-html";
import { t, tn } from "../../i18n/t.ts";
import { icon } from "../icons.ts";
import { qrCode } from "./qr-code.ts";
import { sheet } from "./ui.ts";

/** Messengers may cut off longer links. */
export const RECOMMENDED_LINK_LENGTH = 2000;
/**
 * Longer links give codes too dense to scan from a phone screen. Phone test of M38 (one phone shows, the other scans,
 * code 20rem wide): reliable up to 1800 characters (version 31, 141 modules), not at 2000.
 */
export const QR_MAX_LENGTH = 1800;

export type ShareDialogModel = {
  title: string;
  url: string | null; // null = still encoding
  copy: "idle" | "copied" | "failed";
  /** M35: content key of the shared document; copying or sending the link marks it as shared. */
  contentKey: string | null;
  hasImages: boolean; // the link carries only the alt texts
  qr: boolean; // M38: the QR code is shown
  chain?: boolean; // M38: the link of a chain, shared while playing one of its steps
};

export type ShareDialogActions = {
  copied(ok: boolean): void;
  sent(): void;
  toggleQr(): void;
  close(): void;
};

/** The second way: publishing in the gallery. `publishing` null = no backend, the section is left out. */
export type SharePublish = {
  publishing: "signed-in" | "signed-out" | null;
  username: string | null;
  minMoves: number | null;
  /** M30: null = default colors; "low-contrast" blocks publishing (the server would refuse), a link only gets a hint. */
  theme: "ok" | "low-contrast" | null;
  openPublish(): void;
};

/** Share sheet: link for friends (always), publishing in the gallery (with a backend). Opens only when ready. */
export function shareDialog(model: ShareDialogModel, actions: ShareDialogActions, publish: SharePublish) {
  const { url } = model;
  // navigator.share and the clipboard API only exist in secure contexts (https, localhost).
  const canShare = typeof navigator.share === "function";
  return sheet(
    "share-title",
    actions.close,
    html`<div class="sheet-head">
        <h2 id="share-title" class="sheet-title">${t(model.chain ? "shareChainTitle" : "shareTitle")}</h2>
        <button class="icon-button" aria-label=${t("close")} @click=${actions.close}>${icon("close", 20)}</button>
      </div>

      <section class="share-way primary-way" aria-labelledby="share-link-title">
        <div class="share-way-head">
          <span class="share-way-icon brand">${icon("link", 20)}</span>
          <div>
            <h3 id="share-link-title">${t("shareLinkTitle")}</h3>
            <p>${t("shareLinkText")}</p>
          </div>
        </div>
        ${url === null
          ? html`<p role="status">${t("shareCreating")}</p>`
          : html`
              <div class="share-link-row">
                <input
                  type="text"
                  readonly
                  class="share-link"
                  aria-label=${t("shareLink")}
                  .value=${url}
                  @focus=${(e: Event) => (e.target as HTMLInputElement).select()}
                />
                <button @click=${(e: Event) => copy(e, url, actions)}>
                  ${icon(model.copy === "copied" ? "check" : "copy", 18)}${model.copy === "copied" ? t("shareCopied") : t("shareCopyShort")}
                </button>
              </div>
              ${canShare
                ? html`<button class="secondary block" @click=${() => share(model.title, model.chain ? t("shareChainText") : t("shareText"), url, actions)}>${icon("share", 18)}${t("shareSend")}</button>`
                : nothing}
              <p class="hint">${t("shareLength", { length: url.length })}</p>
              ${url.length > RECOMMENDED_LINK_LENGTH ? html`<p class="status-problem">${t("shareTooLong")}</p>` : nothing}
              ${model.hasImages ? html`<p class="hint">${t("shareImagesHint")}</p>` : nothing}
              ${publish.theme === "low-contrast" ? html`<p class="hint">${t("shareThemeContrast")}</p>` : nothing}
              ${model.copy === "failed" ? html`<p class="status-problem" role="alert">${t("shareCopyFailed")}</p>` : nothing}
              ${qrPart(model, url, actions)}
            `}
      </section>

      ${publish.publishing === null ? nothing : publishWay(publish)}`,
  );
}

/** Folded away by default: a code is only needed with the other phone at hand, and long links take a moment. */
function qrPart(model: ShareDialogModel, url: string, actions: ShareDialogActions) {
  if (url.length > QR_MAX_LENGTH) return html`<p class="hint">${t("shareQrTooLong")}</p>`;
  const code = model.qr ? qrCode(url, t("shareQrLabel", { title: model.title || t("untitled") })) : null;
  return html`<button class="secondary block" aria-expanded=${model.qr ? "true" : "false"} aria-controls="share-qr" @click=${actions.toggleQr}>
      ${icon("qr", 18)}${model.qr ? t("shareQrHide") : t("shareQrShow")}
    </button>
    <div id="share-qr" class="share-qr" ?hidden=${!model.qr}>
      ${code ? html`${code}<p class="hint">${t("shareQrHint")}</p>` : nothing}
    </div>`;
}

function publishWay(publish: SharePublish) {
  const signedIn = publish.publishing === "signed-in";
  const item = (done: boolean, text: string) =>
    html`<li class=${done ? "done" : ""}>${done ? icon("check", 16) : html`<span class="todo-dot" aria-hidden="true"></span>`}<span
        >${text}<span class="visually-hidden">: ${done ? t("checkDone") : t("checkOpen")}</span></span
      ></li>`;
  return html`<section class="share-way" aria-labelledby="share-publish-title">
    <div class="share-way-head">
      <span class="share-way-icon">${icon("globe", 20)}</span>
      <div>
        <h3 id="share-publish-title">${t("sharePublishTitle")}</h3>
        <p>${t("sharePublishText")}</p>
      </div>
    </div>
    <ul class="checklist">
      ${item(true, publish.minMoves === null ? t("checkSolvableShort") : tn("checkSolvableMin", publish.minMoves))}
      ${item(true, t("checkTested"))}
      ${publish.theme ? item(publish.theme === "ok", t("checkThemeContrast")) : nothing}
      ${item(signedIn, signedIn && publish.username ? t("checkSignedInAs", { name: publish.username }) : t("checkSignedIn"))}
    </ul>
    ${signedIn ? nothing : html`<p class="hint">${t("publishSignInHint")} <a href="#/account">${t("accountLink")}</a></p>`}
    ${publish.theme === "low-contrast" ? html`<p class="hint">${t("shareThemeContrast")}</p>` : nothing}
    <button class="secondary block" ?disabled=${!signedIn || publish.theme === "low-contrast"} @click=${publish.openPublish}>${t("sharePublishButton")}</button>
  </section>`;
}

async function share(title: string, text: string, url: string, actions: ShareDialogActions) {
  try {
    await navigator.share({ title, text, url });
    actions.sent();
  } catch {
    // Cancelled by the user or not allowed; the link stays visible in the sheet.
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
