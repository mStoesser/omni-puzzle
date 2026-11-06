import { html, nothing } from "lit-html";
import type { Chain, ChainProgress, StepPuzzle } from "../../core/chains.ts";
import type { Registry } from "../../core/registry.ts";
import { t } from "../../i18n/t.ts";
import type { MessageKey } from "../../i18n/t.ts";
import { reportDialog } from "../components/report-dialog.ts";
import type { ReportDialogActions, ReportDialogModel } from "../components/report-dialog.ts";
import { iconButton, typeBadge } from "../components/ui.ts";
import { icon } from "../icons.ts";

export type ChainViewModel = {
  chain: Chain;
  /** Puzzles of the steps that are still available, by id. */
  puzzles: ReadonlyMap<string, StepPuzzle>;
  reported: boolean | null; // null = signed out or not loaded yet
  report: ReportDialogModel | null;
  notice: MessageKey | null; // e.g. a locked step was opened
};

/** Whether the player may report; computed from the session when rendering. */
export type ChainAccess = "yes" | "loading" | "signed-out" | "own" | "hidden";

export type ChainViewActions = {
  openReport(): void;
  report: ReportDialogActions;
};

/** Overview of a chain: steps with locks, the text before the next puzzle, and the closing screen once all are solved. */
export function chainView(
  model: ChainViewModel,
  progress: ChainProgress,
  access: ChainAccess,
  backHref: string,
  registry: Registry,
  actions: ChainViewActions,
) {
  const { chain } = model;
  const complete = progress.current === null;
  const href = (index: number) => `#/c/${chain.id}/${index + 1}`;
  const current = progress.current === null ? null : chain.steps[progress.current];
  return html`
    <header class="back-head chain-head">
      ${iconButton({ label: t("back"), icon: "chevronLeft", href: backHref })}
      <div>
        <p class="play-kicker">${t("chainKicker")} · ${t("chainSteps", { count: chain.steps.length })}</p>
        <h1>${chain.title}</h1>
      </div>
    </header>
    ${model.notice ? html`<p class="notice" role="alert">${t(model.notice)}</p>` : nothing}
    ${chain.hidden ? html`<p class="notice">${t("chainHidden")}</p>` : nothing}
    <p class="hint">
      ${chain.author === null ? t("publishedByUnknown") : t("chainBy", { author: chain.author })} ·
      ${t("galleryPlays", { count: chain.playCount })}
    </p>
    ${chain.description ? html`<p class="published-description">${chain.description}</p>` : nothing}

    ${complete
      ? progress.availableCount === 0
        ? html`<p class="info-box">${icon("info", 18)}<span>${t("chainNoneAvailable")}</span></p>`
        : html`<section class="box chain-finale" aria-labelledby="chain-finale">
            <span class="solved-icon">${icon("check", 32)}</span>
            <h2 id="chain-finale" class="solved-title">${t("chainCompleteTitle")}</h2>
            <p class="chain-story">${chain.outro || t("chainCompleteText")}</p>
          </section>`
      : html`<section class="box chain-next" aria-labelledby="chain-next">
          <h2 id="chain-next" class="label">${t("chainStep", { index: progress.current! + 1 })}</h2>
          ${current?.text ? html`<p class="chain-story">${current.text}</p>` : nothing}
          <a class="button large block" href=${href(progress.current!)}>
            ${progress.solvedCount === 0 ? t("chainStart") : t("chainContinue", { index: progress.current! + 1 })}${icon("chevronRight", 18)}
          </a>
        </section>`}

    <ol class="chain-steps">
      ${chain.steps.map((step, i) => {
        const state = progress.states[i]!;
        const puzzle = model.puzzles.get(step.puzzle);
        const type = puzzle ? registry.get(puzzle.type) : undefined;
        const head = html`<span class="chain-step-number" aria-hidden="true">${state === "solved" ? icon("check", 16) : state === "locked" ? icon("lock", 16) : i + 1}</span>`;
        if (state === "unavailable") {
          return html`<li class="chain-step is-unavailable">
            ${head}
            <span class="chain-step-body">
              <span class="chain-step-title">${t("chainStep", { index: i + 1 })} · ${t("chainStepUnavailable")}</span>
              <span class="hint">${t("chainStepUnavailableHint")}</span>
            </span>
          </li>`;
        }
        if (state === "locked") {
          return html`<li class="chain-step is-locked">
            ${head}
            <span class="chain-step-body">
              <span class="chain-step-title">${t("chainStep", { index: i + 1 })}</span>
              <span class="chain-step-meta">${typeBadge(type, puzzle?.type ?? "")}<span class="hint">${t("chainStepLocked")}</span></span>
            </span>
            <span class="visually-hidden">${t("chainLockedStep", { index: i + 1 })}</span>
          </li>`;
        }
        // Solved steps can be replayed, also those solved elsewhere once they are unlocked; the open one is next.
        const playable = complete || i <= progress.current!;
        const body = html`${head}
          <span class="chain-step-body">
            <span class="chain-step-title">${puzzle?.title ?? ""}</span>
            <span class="chain-step-meta">
              ${typeBadge(type, puzzle?.type ?? "")}
              <span class="hint">${t(state === "solved" ? "chainStepSolved" : "chainStepOpen")}</span>
            </span>
          </span>`;
        return html`<li class="chain-step is-${state}">
          ${playable
            ? html`<a class="chain-step-link" href=${href(i)} aria-label=${t("chainPlayStep", { index: i + 1, title: puzzle?.title ?? "" })}
                >${body}${icon("chevronRight", 18)}</a
              >`
            : html`<span class="chain-step-link">${body}</span>`}
        </li>`;
      })}
    </ol>

    ${access === "yes" && model.reported === false
      ? html`<button class="secondary chain-report" @click=${actions.openReport}>${icon("flag", 18)}${t("chainReport")}</button>`
      : nothing}
    ${model.reported ? html`<p class="hint">${t("chainReportAlready")}</p>` : nothing}
    ${model.report ? reportDialog({ ...model.report, subject: "chain" }, actions.report) : nothing}
  `;
}
