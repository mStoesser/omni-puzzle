import { html, nothing } from "lit-html";
import { t } from "../../i18n/t.ts";
import type { MessageKey } from "../../i18n/t.ts";
import { icon } from "../icons.ts";

/** M47: joining a round from its link or code, under a name; no account needed. */
export type RoundJoinModel = {
  code: string;
  name: string;
  busy: boolean;
  error: MessageKey | null;
};

export type RoundJoinActions = {
  setName(name: string): void;
  join(): void;
};

export function roundJoinView(model: RoundJoinModel, actions: RoundJoinActions) {
  return html`
    <header class="page-head">
      <h1 class="round-join-title">${icon("users", 26)} ${t("groupJoinTitle")}</h1>
      <p>${t("groupJoinText", { code: model.code })}</p>
    </header>
    <form
      class="account-form round-join"
      @submit=${(e: SubmitEvent) => {
        e.preventDefault();
        actions.join();
      }}
    >
      <label class="field">
        <span>${t("groupJoinName")}</span>
        <input
          type="text"
          name="name"
          autocomplete="nickname"
          maxlength="24"
          required
          autofocus
          .value=${model.name}
          @input=${(e: Event) => actions.setName((e.target as HTMLInputElement).value)}
        />
      </label>
      <p class="hint">${t("groupJoinNameHint")}</p>
      ${model.error ? html`<p class="status-problem" role="alert">${t(model.error)}</p>` : nothing}
      <div class="dialog-actions">
        <a class="button secondary" href="#/gallery?view=rooms">${t("cancel")}</a>
        <button type="submit" class="large" ?disabled=${model.busy || model.name.trim() === ""}>
          ${model.busy ? t("groupJoinBusy") : t("groupJoinButton")}
        </button>
      </div>
    </form>
  `;
}
