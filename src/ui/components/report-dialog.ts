import { html, nothing } from "lit-html";
import { ref } from "lit-html/directives/ref.js";
import { REPORT_COMMENT_MAX, REPORT_REASONS } from "../../core/moderation.ts";
import type { ReportReason } from "../../core/moderation.ts";
import { t } from "../../i18n/t.ts";
import type { MessageKey } from "../../i18n/t.ts";
import { showModal } from "./dialog.ts";

export type ReportDialogModel = { state: "form" | "busy" | "done"; error: MessageKey | null };

export type ReportDialogActions = {
  send(reason: ReportReason, comment: string): void;
  close(): void;
};

export const REASON_TEXT: Record<ReportReason, MessageKey> = {
  inappropriate: "reportReasonInappropriate",
  spam: "reportReasonSpam",
  unsolvable: "reportReasonUnsolvable",
  other: "reportReasonOther",
};

export function reportDialog(model: ReportDialogModel, actions: ReportDialogActions) {
  return html`
    <dialog class="dialog" ${ref(showModal)} @close=${actions.close} aria-labelledby="report-title">
      <h2 id="report-title">${t("reportTitle")}</h2>
      ${model.state === "done"
        ? html`<p class="status-ok" role="status">${t("reportDone")}</p>
            <div class="dialog-actions"><button @click=${actions.close}>${t("close")}</button></div>`
        : html`<form
            @submit=${(e: SubmitEvent) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget as HTMLFormElement);
              actions.send(String(form.get("reason")) as ReportReason, String(form.get("comment") ?? ""));
            }}
          >
            <p>${t("reportIntro")}</p>
            <fieldset class="report-reasons">
              <legend>${t("reportReason")}</legend>
              ${REPORT_REASONS.map(
                (reason, i) => html`<label class="choice">
                  <input type="radio" name="reason" value=${reason} required ?checked=${i === 0} />
                  <span>${t(REASON_TEXT[reason])}</span>
                </label>`,
              )}
            </fieldset>
            <label class="field">
              <span>${t("reportComment")}</span>
              <textarea name="comment" rows="3" maxlength=${REPORT_COMMENT_MAX}></textarea>
              <span class="hint">${t("reportCommentHint", { max: REPORT_COMMENT_MAX })}</span>
            </label>
            ${model.error ? html`<p class="status-problem" role="alert">${t(model.error)}</p>` : nothing}
            <div class="dialog-actions">
              <button type="button" class="secondary" @click=${actions.close}>${t("cancel")}</button>
              <button type="submit" ?disabled=${model.state === "busy"}>
                ${model.state === "busy" ? t("reportBusy") : t("reportSend")}
              </button>
            </div>
          </form>`}
    </dialog>
  `;
}
