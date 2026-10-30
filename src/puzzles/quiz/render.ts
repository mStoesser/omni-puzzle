import { html, nothing } from "lit-html";
import { keyed } from "lit-html/directives/keyed.js";
import type { PlayContext } from "../../core/types.ts";
import { t } from "../../i18n/t.ts";
import { correctChoices, isCorrect, passed, score } from "./logic.ts";
import type { QuizAnswer, QuizData, QuizMove, QuizQuestion, QuizState } from "./logic.ts";

type Ctx = PlayContext<QuizData, QuizState, QuizMove>;

const NUMBER_FORMAT = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 6 });

export function renderPlay(ctx: Ctx) {
  const { data, state } = ctx;
  if (state.finished) return result(data, state);
  const question = data.questions[state.index]!;
  const given = state.answers[state.index] ?? null;
  const total = data.questions.length;
  return html`
    <section class="quiz">
      <p class="quiz-progress">${t("quizProgress", { current: state.index + 1, total })}</p>
      <progress max=${total} value=${state.index + (given ? 1 : 0)} aria-hidden="true"></progress>
      ${keyed(state.index, questionForm(question, given, ctx))}
    </section>
  `;
}

function questionForm(question: QuizQuestion, given: QuizAnswer | null, ctx: Ctx) {
  const last = ctx.state.index === ctx.data.questions.length - 1;
  return html`
    <form class="quiz-question" @submit=${(e: SubmitEvent) => submit(e, question, ctx)}>
      <h2 class="quiz-text">${question.text}</h2>
      <fieldset class="quiz-inputs" ?disabled=${given !== null}>
        <legend class="visually-hidden">${t("quizYourAnswer")}</legend>
        ${inputs(question, given)}
      </fieldset>
      ${given
        ? html`
            ${feedback(question, given)}
            <button type="button" class="quiz-next" @click=${() => ctx.dispatch({ type: "next" })}>
              ${last ? t("quizToResult") : t("quizNext")}
            </button>
          `
        : html`<button type="submit">${t("quizSubmit")}</button>`}
    </form>
  `;
}

function inputs(question: QuizQuestion, given: QuizAnswer | null) {
  switch (question.kind) {
    case "single":
    case "multi": {
      // After answering, the correct options are marked (recovered from the hash).
      const correct = given ? new Set(correctChoices(question) ?? []) : null;
      const type = question.kind === "single" ? "radio" : "checkbox";
      return html`
        ${question.kind === "multi" ? html`<p class="hint">${t("quizMultiHint")}</p>` : nothing}
        ${question.options.map(
          (option, i) => html`
            <label class="quiz-option ${correct?.has(i) ? "correct" : ""}">
              <input type=${type} name="choice" value=${i} ?required=${type === "radio"} />
              <span>${option}</span>
            </label>
          `,
        )}
      `;
    }
    case "text":
      return html`<input class="quiz-input" type="text" name="text" required autocomplete="off" maxlength="500" aria-label=${t("quizYourAnswer")} />`;
    case "number":
      // type=text with inputmode, so a German decimal comma works.
      return html`<input
        class="quiz-input"
        type="text"
        inputmode="decimal"
        name="number"
        required
        pattern="\\s*-?[0-9]+([.,][0-9]+)?\\s*"
        autocomplete="off"
        aria-label=${t("quizYourAnswer")}
      />`;
  }
}

function feedback(question: QuizQuestion, given: QuizAnswer) {
  if (isCorrect(question, given)) return html`<p class="quiz-feedback correct" role="status">${t("quizCorrect")}</p>`;
  return html`<p class="quiz-feedback wrong" role="status">${t("quizWrong")} ${solution(question)}</p>`;
}

function solution(question: QuizQuestion): string {
  switch (question.kind) {
    case "single":
    case "multi": {
      const correct = correctChoices(question) ?? [];
      return t("quizSolution", { solution: correct.map((i) => question.options[i]).join(", ") });
    }
    case "number": {
      const value = NUMBER_FORMAT.format(question.value);
      const solution = question.tolerance > 0 ? `${value} (± ${NUMBER_FORMAT.format(question.tolerance)})` : value;
      return t("quizSolution", { solution });
    }
    case "text":
      return ""; // only hashes are known
  }
}

function submit(e: SubmitEvent, question: QuizQuestion, ctx: Ctx) {
  e.preventDefault();
  const form = new FormData(e.currentTarget as HTMLFormElement);
  const answer = readAnswer(question, form);
  if (answer) ctx.dispatch({ type: "answer", answer });
}

function readAnswer(question: QuizQuestion, form: FormData): QuizAnswer | null {
  switch (question.kind) {
    case "single":
      return form.has("choice") ? { kind: "single", choice: Number(form.get("choice")) } : null;
    case "multi": {
      const choices = form.getAll("choice").map(Number);
      return choices.length > 0 ? { kind: "multi", choices } : null;
    }
    case "text":
      return { kind: "text", text: String(form.get("text") ?? "") };
    case "number": {
      const value = parseDecimal(String(form.get("number") ?? ""));
      return Number.isFinite(value) ? { kind: "number", value } : null;
    }
  }
}

/** Parses "3,14" and "3.14"; empty or invalid input gives NaN. */
export function parseDecimal(text: string): number {
  const trimmed = text.trim().replace(",", ".");
  return trimmed === "" ? Number.NaN : Number(trimmed);
}

function result(data: QuizData, state: QuizState) {
  const correct = score(data, state);
  const total = data.questions.length;
  const ok = passed(data, state);
  return html`
    <section class="quiz quiz-result">
      <h2 class=${ok ? "status-ok" : "status-problem"}>${ok ? t("quizPassed") : t("quizFailed")}</h2>
      <p>${t("quizScore", { correct, total, percent: Math.round((correct / total) * 100) })}</p>
      <p>${t("quizPassMark", { percent: data.passPercent })}</p>
      <ol class="quiz-summary">
        ${data.questions.map((q, i) => {
          const answer = state.answers[i];
          const right = answer ? isCorrect(q, answer) : false;
          return html`<li class=${right ? "correct" : "wrong"}>
            <span aria-label=${right ? t("quizCorrect") : t("quizWrong")}>${right ? "✓" : "✗"}</span> ${q.text}
          </li>`;
        })}
      </ol>
      ${ok ? nothing : html`<p>${t("quizTryAgain")}</p>`}
    </section>
  `;
}
