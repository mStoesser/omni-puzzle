import { html, nothing } from "lit-html";
import { canRedoEdit, canUndoEdit, currentData, readiness } from "../../core/editor-session.ts";
import type { EditorSession } from "../../core/editor-session.ts";
import type { AnyPuzzleType, SolveResult } from "../../core/types.ts";
import { t } from "../../i18n/t.ts";

export type EditorViewModel = {
  type: AnyPuzzleType;
  session: EditorSession<unknown>;
  problems: readonly string[];
  solve: SolveResult<unknown> | null; // null = not checked yet
  verified: boolean;
};

export type EditorViewActions = {
  update(data: unknown): void;
  undo(): void;
  redo(): void;
  setTitle(title: string): void;
  testPlay(): void;
};

export function editorView(model: EditorViewModel, actions: EditorViewActions) {
  const { type, session } = model;
  const hasSolver = type.solve !== undefined;
  const { canTest } = readiness({ ...model, hasSolver });
  return html`
    <header class="toolbar">
      <a class="button secondary" href="#/" aria-label=${t("back")}>←</a>
      <h1 class="toolbar-title">${t(type.name)}</h1>
    </header>
    <label class="field">
      <span>${t("editorTitleLabel")}</span>
      <input
        type="text"
        maxlength="200"
        .value=${session.title}
        @input=${(e: Event) => actions.setTitle((e.target as HTMLInputElement).value)}
      />
    </label>
    <div class="editor-toolbar">
      <button class="secondary" @click=${actions.undo} ?disabled=${!canUndoEdit(session)}>${t("undo")}</button>
      <button class="secondary" @click=${actions.redo} ?disabled=${!canRedoEdit(session)}>${t("redo")}</button>
      <button @click=${actions.testPlay} ?disabled=${!canTest}>${t("testPlay")}</button>
    </div>
    ${type.renderEditor({ data: currentData(session), update: actions.update })}
    <section class="editor-status" role="status">
      ${model.problems.length > 0
        ? html`
            <p class="status-problem">${t("problemsHeading")}</p>
            <ul class="problem-list">
              ${model.problems.map((text) => html`<li>${text}</li>`)}
            </ul>
          `
        : html`
            ${hasSolver ? html`<p class=${solveClass(model.solve)}>${solveText(model.solve)}</p>` : nothing}
            <p class=${model.verified ? "status-ok" : ""}>
              ${model.verified ? t("statusVerified") : t("statusNotVerified")}
            </p>
          `}
    </section>
  `;
}

function solveText(solve: SolveResult<unknown> | null): string {
  if (!solve) return t("statusChecking");
  switch (solve.status) {
    case "solved":
      return solve.moves.length === 1 ? t("statusSolvableOne") : t("statusSolvable", { moves: solve.moves.length });
    case "unsolvable":
      return t("statusUnsolvable");
    case "aborted":
      return t("statusAborted");
  }
}

function solveClass(solve: SolveResult<unknown> | null): string {
  return solve?.status === "unsolvable" ? "status-problem" : solve?.status === "solved" ? "status-ok" : "";
}
