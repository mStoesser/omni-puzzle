import { html, nothing } from "lit-html";
import { CHAIN, draftProblem } from "../../core/chains.ts";
import type { ChainDraft } from "../../core/chains.ts";
import type { Registry } from "../../core/registry.ts";
import { t } from "../../i18n/t.ts";
import type { MessageKey } from "../../i18n/t.ts";
import { backHeader, iconButton, typeBadge } from "../components/ui.ts";
import { icon } from "../icons.ts";

export type ChainEditorModel = {
  draft: ChainDraft;
  /** Own visible publications to pick from; null = loading. */
  own: { id: string; title: string; type: string }[] | null;
  checking: boolean; // a pasted link is being looked up
  addError: MessageKey | null;
  publishing: boolean;
  error: MessageKey | null;
};

export type ChainEditorActions = {
  setField(field: "title" | "description" | "outro", value: string): void;
  setStepText(index: number, text: string): void;
  move(index: number, delta: -1 | 1): void;
  remove(index: number): void;
  addOwn(puzzleId: string): void;
  addLink(text: string): Promise<boolean>; // true = added, the field is cleared
  publish(): void;
};

/** `signedIn` false: only a hint to sign in. */
export function chainEditorView(model: ChainEditorModel | null, signedIn: boolean, registry: Registry, actions: ChainEditorActions) {
  const head = backHeader("#/gallery?view=chains", t("chainEditorTitle"));
  if (!signedIn || !model) {
    return html`${head}
      <p class="info-box">${icon("info", 18)}<span>${t("chainEditorSignIn")} <a href="#/account">${t("accountLink")}</a></span></p>`;
  }
  const { draft } = model;
  const problem = draftProblem(draft);
  const added = new Set(draft.steps.map((s) => s.puzzle));
  const choices = (model.own ?? []).filter((p) => !added.has(p.id));
  const full = draft.steps.length >= CHAIN.maxSteps;
  return html`
    ${head}
    <p>${t("chainEditorIntro")}</p>
    <!-- No <form>: Enter in a field must not publish, a chain cannot be changed afterwards. -->
    <div class="account-form chain-editor">
      <label class="field">
        <span>${t("chainTitle")}</span>
        <input type="text" name="title" required maxlength=${CHAIN.maxTitle} .value=${draft.title}
          @input=${(e: Event) => actions.setField("title", (e.target as HTMLInputElement).value)} />
      </label>
      <label class="field">
        <span>${t("chainDescription")}</span>
        <textarea name="description" rows="2" maxlength=${CHAIN.maxDescription} .value=${draft.description}
          @input=${(e: Event) => actions.setField("description", (e.target as HTMLTextAreaElement).value)}></textarea>
      </label>

      <fieldset class="chain-editor-steps">
        <legend>${t("chainStepsHeading", { count: draft.steps.length, max: CHAIN.maxSteps })}</legend>
        <p class="hint">${t("chainStepsHint", { min: CHAIN.minSteps, max: CHAIN.maxSteps })}</p>
        <ol class="chain-draft-steps">
          ${draft.steps.map((step, i) => html`<li class="chain-draft-step">
            <div class="chain-draft-head">
              <span class="chain-step-number" aria-hidden="true">${i + 1}</span>
              <span class="chain-step-body">
                <span class="chain-step-title">${step.title}</span>
                ${typeBadge(registry.get(step.type), step.type)}
              </span>
              ${iconButton({ label: `${t("chainMoveUp")}: ${step.title}`, icon: "chevronUp", disabled: i === 0, onClick: () => actions.move(i, -1) })}
              ${iconButton({ label: `${t("chainMoveDown")}: ${step.title}`, icon: "chevronDown", disabled: i === draft.steps.length - 1, onClick: () => actions.move(i, 1) })}
              ${iconButton({ label: `${t("chainRemoveStep")}: ${step.title}`, icon: "trash", onClick: () => actions.remove(i) })}
            </div>
            <label class="field">
              <span>${t("chainStepText")}</span>
              <textarea rows="2" maxlength=${CHAIN.maxText} .value=${step.text} placeholder=${i === 0 ? t("chainStepTextHint") : nothing}
                @input=${(e: Event) => actions.setStepText(i, (e.target as HTMLTextAreaElement).value)}></textarea>
            </label>
          </li>`)}
        </ol>

        ${full
          ? html`<p class="hint">${t("chainFull", { max: CHAIN.maxSteps })}</p>`
          : html`<div class="chain-add">
              <div class="field">
                <label for="chain-own">${t("chainAddOwn")}</label>
                ${model.own === null
                  ? html`<span class="hint">${t("loading")}</span>`
                  : model.own.length === 0
                    ? html`<span class="hint">${t("chainAddOwnEmpty")}</span>`
                    : html`<span class="chain-add-row">
                        <select id="chain-own">
                          <option value="">${t("chainAddOwnChoose")}</option>
                          ${choices.map((p) => html`<option value=${p.id}>${p.title}</option>`)}
                        </select>
                        <button type="button" class="secondary" ?disabled=${choices.length === 0} @click=${(e: Event) => {
                          const select = (e.currentTarget as HTMLElement).parentElement!.querySelector("select")!;
                          if (select.value) actions.addOwn(select.value);
                          select.value = "";
                        }}>${t("chainAdd")}</button>
                      </span>`}
              </div>
              <div class="field">
                <label for="chain-link">${t("chainAddLink")}</label>
                <span class="chain-add-row">
                  <input type="text" id="chain-link" inputmode="url" autocomplete="off" aria-describedby="chain-link-hint" placeholder="…/#/g/…" @keydown=${(e: KeyboardEvent) => {
                    if (e.key !== "Enter") return;
                    void addLink(e.currentTarget as HTMLInputElement, actions);
                  }} />
                  <button type="button" class="secondary" ?disabled=${model.checking} @click=${(e: Event) =>
                    void addLink((e.currentTarget as HTMLElement).parentElement!.querySelector("input")!, actions)}>
                    ${model.checking ? t("chainAddBusy") : t("chainAdd")}
                  </button>
                </span>
                <span class="hint" id="chain-link-hint">${t("chainAddLinkHint")}</span>
              </div>
              ${model.addError ? html`<p class="status-problem" role="alert">${t(model.addError)}</p>` : nothing}
            </div>`}
      </fieldset>

      <label class="field">
        <span>${t("chainOutro")}</span>
        <textarea name="outro" rows="3" maxlength=${CHAIN.maxOutro} .value=${draft.outro}
          @input=${(e: Event) => actions.setField("outro", (e.target as HTMLTextAreaElement).value)}></textarea>
        <span class="hint">${t("chainOutroHint")}</span>
      </label>

      ${model.error ? html`<p class="notice" role="alert">${t(model.error)}</p>` : problem ? html`<p class="hint">${t(problem)}</p>` : nothing}
      <button type="button" class="large chain-publish" ?disabled=${problem !== null || model.publishing} @click=${actions.publish}>
        ${model.publishing ? t("chainPublishing") : t("chainPublish")}
      </button>
    </div>
  `;
}

async function addLink(input: HTMLInputElement, actions: ChainEditorActions) {
  if (await actions.addLink(input.value)) input.value = "";
}
