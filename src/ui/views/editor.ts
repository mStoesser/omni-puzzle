import { html, nothing } from "lit-html";
import { canRedoEdit, canUndoEdit, currentData, readiness } from "../../core/editor-session.ts";
import type { EditorSession } from "../../core/editor-session.ts";
import type { AnyPuzzleType, EditorContext, SolveResult } from "../../core/types.ts";
import { t } from "../../i18n/t.ts";
import { publishDialog } from "../components/publish-dialog.ts";
import type { PublishDialogActions, PublishDialogModel } from "../components/publish-dialog.ts";
import { shareDialog } from "../components/share-dialog.ts";
import type { ShareDialogActions, ShareDialogModel } from "../components/share-dialog.ts";

export type EditorViewModel = {
  type: AnyPuzzleType;
  session: EditorSession<unknown>;
  problems: readonly string[];
  solve: SolveResult<unknown> | null; // null = not checked yet
  verified: boolean;
  share: ShareDialogModel | null; // open share dialog
  /** null = no backend; otherwise whether the user can publish now. */
  publishing: "signed-in" | "signed-out" | null;
  publish: PublishDialogModel | null; // open publish dialog
  images: EditorContext<unknown>["images"];
};

export type EditorViewActions = {
  update(data: unknown): void;
  undo(): void;
  redo(): void;
  setTitle(title: string): void;
  testPlay(): void;
  openShare(): void;
  share: ShareDialogActions;
  openPublish(): void;
  publish: PublishDialogActions;
};

export function editorView(model: EditorViewModel, actions: EditorViewActions) {
  const { type, session } = model;
  const hasSolver = type.solve !== undefined;
  const { canTest, canShare } = readiness({ ...model, hasSolver });
  return html`
    <header class="toolbar">
      <a class="button secondary" href="#/library" aria-label=${t("back")}>←</a>
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
      <span class="spacer"></span>
      <button class="secondary" @click=${actions.testPlay} ?disabled=${!canTest}>${t("testPlay")}</button>
      <button @click=${actions.openShare} ?disabled=${!canShare}>${t("share")}</button>
      ${model.publishing
        ? html`<button @click=${actions.openPublish} ?disabled=${!canShare || model.publishing !== "signed-in"}>
            ${t("publish")}
          </button>`
        : nothing}
    </div>
    ${canShare && model.publishing === "signed-out"
      ? html`<p class="hint">${t("publishSignInHint")} <a href="#/account">${t("accountLink")}</a></p>`
      : nothing}
    ${type.renderEditor({ data: currentData(session), update: actions.update, images: model.images })}
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
    ${model.share ? shareDialog(model.share, actions.share) : nothing}
    ${model.publish ? publishDialog(model.publish, actions.publish) : nothing}
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
