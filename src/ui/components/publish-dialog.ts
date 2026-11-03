import { html, nothing } from "lit-html";
import { PUBLISH } from "../../core/publish.ts";
import { t } from "../../i18n/t.ts";
import type { MessageKey } from "../../i18n/t.ts";
import { sheet } from "./ui.ts";

export type PublishDialogModel = {
  title: string;
  author: string;
  state: "confirm" | "busy" | "done";
  error: MessageKey | null;
  /** After success: the new puzzle; after a duplicate: the existing one. */
  publishedId: string | null;
};

export type PublishDialogActions = {
  publish(description: string): void;
  close(): void;
};

export function publishDialog(model: PublishDialogModel, actions: PublishDialogActions) {
  const href = model.publishedId ? `#/g/${model.publishedId}` : null;
  const url = href ? `${location.origin}${location.pathname}${href}` : "";
  return sheet(
    "publish-title",
    actions.close,
    html`
      <h2 id="publish-title" class="sheet-title">${t("publishTitle")}</h2>
      ${model.state === "done"
        ? html`
            <p class="status-ok" role="status">${t("publishDone")}</p>
            <input
              type="text"
              readonly
              class="share-link"
              aria-label=${t("shareLink")}
              .value=${url}
              @focus=${(e: Event) => (e.target as HTMLInputElement).select()}
            />
            <div class="dialog-actions">
              <button class="secondary" @click=${actions.close}>${t("close")}</button>
              <a class="button" href=${href!}>${t("publishOpen")}</a>
            </div>
          `
        : html`
            <form
              @submit=${(e: SubmitEvent) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget as HTMLFormElement);
                actions.publish(String(form.get("description") ?? ""));
              }}
            >
              <p>${t("publishIntro", { title: model.title, author: model.author })}</p>
              <p class="notice">${t("publishImmutable")}</p>
              <label class="field">
                <span>${t("publishDescription")}</span>
                <textarea name="description" rows="3" maxlength=${PUBLISH.maxDescription}></textarea>
                <span class="hint">${t("publishDescriptionHint", { max: PUBLISH.maxDescription })}</span>
              </label>
              ${model.error
                ? html`<p class="status-problem" role="alert">
                    ${t(model.error, { perDay: PUBLISH.perDay })}
                    ${href ? html` <a href=${href}>${t("publishDuplicateOpen")}</a>` : nothing}
                  </p>`
                : nothing}
              ${model.state === "busy" ? html`<p role="status">${t("publishBusy")}</p>` : nothing}
              <div class="dialog-actions">
                <button type="button" class="secondary" @click=${actions.close}>${t("cancel")}</button>
                <button type="submit" ?disabled=${model.state === "busy"}>${t("publishConfirm")}</button>
              </div>
            </form>
          `}
    `,
  );
}
