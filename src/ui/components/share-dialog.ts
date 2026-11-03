import { html, nothing } from "lit-html";
import { t } from "../../i18n/t.ts";
import { icon } from "../icons.ts";
import { sheet } from "./ui.ts";

/** Messengers may cut off longer links. */
export const RECOMMENDED_LINK_LENGTH = 2000;

export type ShareDialogModel = {
  title: string;
  url: string | null; // null = still encoding
  copy: "idle" | "copied" | "failed";
  hasImages: boolean; // the link carries only the alt texts
};

export type ShareDialogActions = {
  copied(ok: boolean): void;
  close(): void;
};

/** The second way: publishing in the gallery. `publishing` null = no backend, the section is left out. */
export type SharePublish = {
  publishing: "signed-in" | "signed-out" | null;
  username: string | null;
  minMoves: number | null;
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
        <h2 id="share-title" class="sheet-title">${t("shareTitle")}</h2>
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
                ? html`<button class="secondary block" @click=${() => share(model.title, url)}>${icon("share", 18)}${t("shareSend")}</button>`
                : nothing}
              <p class="hint">${t("shareLength", { length: url.length })}</p>
              ${url.length > RECOMMENDED_LINK_LENGTH ? html`<p class="status-problem">${t("shareTooLong")}</p>` : nothing}
              ${model.hasImages ? html`<p class="hint">${t("shareImagesHint")}</p>` : nothing}
              ${model.copy === "failed" ? html`<p class="status-problem" role="alert">${t("shareCopyFailed")}</p>` : nothing}
            `}
      </section>

      ${publish.publishing === null ? nothing : publishWay(publish)}`,
  );
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
      ${item(true, publish.minMoves === null ? t("checkSolvableShort") : publish.minMoves === 1 ? t("checkSolvableMinOne") : t("checkSolvableMin", { moves: publish.minMoves }))}
      ${item(true, t("checkTested"))}
      ${item(signedIn, signedIn && publish.username ? t("checkSignedInAs", { name: publish.username }) : t("checkSignedIn"))}
    </ul>
    ${signedIn ? nothing : html`<p class="hint">${t("publishSignInHint")} <a href="#/account">${t("accountLink")}</a></p>`}
    <button class="secondary block" ?disabled=${!signedIn} @click=${publish.openPublish}>${t("sharePublishButton")}</button>
  </section>`;
}

async function share(title: string, url: string) {
  try {
    await navigator.share({ title, text: t("shareText"), url });
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
