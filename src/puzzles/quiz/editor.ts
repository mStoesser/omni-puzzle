import { html, nothing } from "lit-html";
import { repeat } from "lit-html/directives/repeat.js";
import type { EditorContext } from "../../core/types.ts";
import { t } from "../../i18n/t.ts";
import type { MessageKey } from "../../i18n/t.ts";
import {
  addOption,
  addQuestion,
  addTextAnswer,
  changeKind,
  moveQuestion,
  removeOption,
  removeQuestion,
  removeTextAnswer,
  setNumber,
  setOption,
  setPassPercent,
  setQuestionText,
  toggleCorrect,
} from "./edit.ts";
import { LIMITS, QUESTION_KINDS, correctChoices, findProblems, newQuestionId, textHash } from "./logic.ts";
import type { ProblemCode, QuestionKind, QuizData, QuizQuestion } from "./logic.ts";
import { parseDecimal } from "./render.ts";

type Ctx = EditorContext<QuizData>;

const KIND_NAME: Record<QuestionKind, MessageKey> = {
  single: "quizKindSingle",
  multi: "quizKindMulti",
  text: "quizKindText",
  number: "quizKindNumber",
};

const PROBLEM_TEXT: Record<ProblemCode, MessageKey> = {
  "no-questions": "quizProblemNoQuestions",
  "duplicate-id": "quizProblemDuplicateId",
  "empty-question": "quizProblemEmptyQuestion",
  "empty-option": "quizProblemEmptyOption",
  "too-few-options": "quizProblemTooFewOptions",
  "no-correct-option": "quizProblemNoCorrect",
  "no-text-answer": "quizProblemNoTextAnswer",
};

// Free-text answers typed in this session, by hash, so the creator can still read them.
// Only hashes are saved and shared; after a reload, answers show as hidden.
const typedAnswers = new Map<string, string>();

export function problems(data: QuizData): string[] {
  return findProblems(data).map((p) =>
    p.question === undefined
      ? t(PROBLEM_TEXT[p.code])
      : t("quizProblemAt", { number: p.question + 1, problem: t(PROBLEM_TEXT[p.code]) }),
  );
}

export function renderEditor(ctx: Ctx) {
  const { data } = ctx;
  const problemQuestions = new Set(findProblems(data).flatMap((p) => (p.question === undefined ? [] : [p.question])));
  return html`
    <p class="hint">${t("quizEditorHint")}</p>
    <label class="field">
      <span>${t("quizPassPercent")}</span>
      <input
        type="number"
        min="1"
        max="100"
        step="1"
        .value=${String(data.passPercent)}
        @change=${(e: Event) => ctx.update(setPassPercent(data, Number(inputValue(e))))}
      />
    </label>
    <ol class="quiz-edit-list">
      ${repeat(
        data.questions,
        (q) => q.id,
        (q, i) => questionEditor(q, i, ctx, problemQuestions.has(i)),
      )}
    </ol>
    <div class="quiz-add">
      <select aria-label=${t("quizKind")} class="quiz-add-kind">
        ${QUESTION_KINDS.map((kind) => html`<option value=${kind}>${t(KIND_NAME[kind])}</option>`)}
      </select>
      <button
        type="button"
        ?disabled=${data.questions.length >= LIMITS.maxQuestions}
        @click=${(e: Event) => {
          const select = (e.currentTarget as Element).parentElement!.querySelector("select")!;
          ctx.update(addQuestion(data, select.value as QuestionKind, newQuestionId()));
        }}
      >
        ${t("quizAddQuestion")}
      </button>
    </div>
  `;
}

function questionEditor(q: QuizQuestion, i: number, ctx: Ctx, problem: boolean) {
  const { data } = ctx;
  const count = data.questions.length;
  return html`
    <li class="quiz-edit-question ${problem ? "problem" : ""}">
      <div class="quiz-edit-head">
        <strong>${t("quizQuestionNumber", { number: i + 1 })}</strong>
        <select
          aria-label=${t("quizKind")}
          @change=${(e: Event) => ctx.update(changeKind(data, i, inputValue(e) as QuestionKind))}
        >
          ${QUESTION_KINDS.map(
            (kind) => html`<option value=${kind} ?selected=${kind === q.kind}>${t(KIND_NAME[kind])}</option>`,
          )}
        </select>
        <button type="button" class="secondary" aria-label=${t("quizMoveUp")} ?disabled=${i === 0}
          @click=${() => ctx.update(moveQuestion(data, i, -1))}>↑</button>
        <button type="button" class="secondary" aria-label=${t("quizMoveDown")} ?disabled=${i === count - 1}
          @click=${() => ctx.update(moveQuestion(data, i, 1))}>↓</button>
        <button type="button" class="secondary danger" aria-label=${t("quizRemoveQuestion")}
          @click=${() => ctx.update(removeQuestion(data, i))}>✕</button>
      </div>
      <textarea
        rows="2"
        maxlength=${LIMITS.maxText}
        placeholder=${t("quizQuestionPlaceholder")}
        aria-label=${t("quizQuestionText")}
        .value=${q.text}
        @change=${(e: Event) => ctx.update(setQuestionText(data, i, inputValue(e)))}
      ></textarea>
      ${answerEditor(q, i, ctx)}
    </li>
  `;
}

function answerEditor(q: QuizQuestion, i: number, ctx: Ctx) {
  const { data } = ctx;
  switch (q.kind) {
    case "single":
    case "multi": {
      const correct = new Set(correctChoices(q) ?? []);
      const type = q.kind === "single" ? "radio" : "checkbox";
      return html`
        <p class="hint">${q.kind === "single" ? t("quizMarkOne") : t("quizMarkSome")}</p>
        <ul class="quiz-edit-options">
          ${q.options.map(
            (option, o) => html`
              <li>
                <input
                  type=${type}
                  name="correct-${q.id}"
                  aria-label=${t("quizCorrectOption", { number: o + 1 })}
                  .checked=${correct.has(o)}
                  @change=${() => ctx.update(toggleCorrect(data, i, o))}
                />
                <input
                  type="text"
                  maxlength=${LIMITS.maxOption}
                  placeholder=${t("quizOptionPlaceholder", { number: o + 1 })}
                  .value=${option}
                  @change=${(e: Event) => ctx.update(setOption(data, i, o, inputValue(e)))}
                />
                <button type="button" class="secondary" aria-label=${t("quizRemoveOption", { number: o + 1 })}
                  ?disabled=${q.options.length <= LIMITS.minOptions}
                  @click=${() => ctx.update(removeOption(data, i, o))}>✕</button>
              </li>
            `,
          )}
        </ul>
        <button type="button" class="secondary" ?disabled=${q.options.length >= LIMITS.maxOptions}
          @click=${() => ctx.update(addOption(data, i))}>${t("quizAddOption")}</button>
      `;
    }
    case "text":
      return html`
        <p class="hint">${t("quizTextHint")}</p>
        <ul class="quiz-edit-answers">
          ${q.answers.map(
            (hash, a) => html`
              <li>
                <span class=${typedAnswers.has(hash) ? "" : "hidden-answer"}>${typedAnswers.get(hash) ?? t("quizHiddenAnswer")}</span>
                <button type="button" class="secondary" aria-label=${t("quizRemoveAnswer")}
                  @click=${() => ctx.update(removeTextAnswer(data, i, a))}>✕</button>
              </li>
            `,
          )}
        </ul>
        ${q.answers.length < LIMITS.maxAnswers
          ? html`<div class="quiz-edit-add-answer">
              <input
                type="text"
                maxlength=${LIMITS.maxText}
                placeholder=${t("quizAnswerPlaceholder")}
                aria-label=${t("quizAnswerPlaceholder")}
                @keydown=${(e: KeyboardEvent) => {
                  if (e.key === "Enter") addAnswer(e.currentTarget as HTMLInputElement, q, i, ctx);
                }}
              />
              <button type="button" class="secondary"
                @click=${(e: Event) => addAnswer((e.currentTarget as Element).previousElementSibling as HTMLInputElement, q, i, ctx)}>
                ${t("quizAddAnswer")}
              </button>
            </div>`
          : nothing}
      `;
    case "number":
      return html`
        <div class="quiz-edit-number">
          ${numberField(t("quizNumberValue"), q.value, (value) => setNumber(data, i, "value", value), ctx)}
          ${numberField(t("quizNumberTolerance"), q.tolerance, (value) => setNumber(data, i, "tolerance", value), ctx)}
        </div>
      `;
  }
}

function numberField(label: string, value: number, set: (value: number) => QuizData, ctx: Ctx) {
  const formatted = String(value).replace(".", ",");
  return html`
    <label class="field">
      <span>${label}</span>
      <input
        type="text"
        inputmode="decimal"
        .value=${formatted}
        @change=${(e: Event) => {
          const next = set(parseDecimal(inputValue(e)));
          // Invalid input changes nothing and causes no re-render, so restore the field here.
          if (next === ctx.data) (e.currentTarget as HTMLInputElement).value = formatted;
          else ctx.update(next);
        }}
      />
    </label>
  `;
}

function addAnswer(input: HTMLInputElement, q: QuizQuestion, i: number, ctx: Ctx) {
  const text = input.value;
  if (text.trim() === "") return;
  typedAnswers.set(textHash(q.id, text), text.trim());
  input.value = "";
  ctx.update(addTextAnswer(ctx.data, i, text));
}

function inputValue(e: Event): string {
  return (e.currentTarget as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
}
