import { html, nothing } from "lit-html";
import { canRedoEdit, canUndoEdit, currentData, readiness } from "../../core/editor-session.ts";
import type { EditorSession } from "../../core/editor-session.ts";
import type { AnyPuzzleType, EditorContext, SolveResult } from "../../core/types.ts";
import { t } from "../../i18n/t.ts";
import { publishDialog } from "../components/publish-dialog.ts";
import type { PublishDialogActions, PublishDialogModel } from "../components/publish-dialog.ts";
import { shareDialog } from "../components/share-dialog.ts";
import type { ShareDialogActions, ShareDialogModel } from "../components/share-dialog.ts";
import { iconButton, segment, typeVars } from "../components/ui.ts";
import { icon } from "../icons.ts";
import type { TemplateResult } from "lit-html";

export type EditorViewModel = {
  type: AnyPuzzleType;
  session: EditorSession<unknown>;
  problems: readonly string[];
  solve: SolveResult<unknown> | null; // null = not checked yet
  verified: boolean;
  share: ShareDialogModel | null; // open share dialog
  /** null = no backend; otherwise whether the user can publish now. */
  publishing: "signed-in" | "signed-out" | null;
  username: string | null; // signed-in author, for the publish checklist
  publish: PublishDialogModel | null; // open publish dialog
  images: EditorContext<unknown>["images"];
  /** Test play inside the editor frame (segment "Probespielen"); null = building. */
  testPlay: TemplateResult | null;
};

export type EditorViewActions = {
  update(data: unknown): void;
  undo(): void;
  redo(): void;
  setTitle(title: string): void;
  testPlay(): void;
  backToEditor(): void;
  openShare(): void;
  share: ShareDialogActions;
  openPublish(): void;
  publish: PublishDialogActions;
};

export function editorView(model: EditorViewModel, actions: EditorViewActions) {
  const { type, session } = model;
  const hasSolver = type.solve !== undefined;
  const { canTest, canShare } = readiness({ ...model, hasSolver });
  const mode = model.testPlay ? "test" : "build";
  return html`
    <header class="editor-head">
      ${iconButton({ label: t("editorClose"), icon: "close", href: "#/library" })}
      <div class="editor-title typed" style=${typeVars(type)}>
        <span class="play-kicker">${t(type.name)} · ${model.verified ? t("editorReady") : t("libraryDraft")}</span>
        <label class="title-input">
          <span class="visually-hidden">${t("editorTitleLabel")}</span>
          <input
            type="text"
            maxlength="200"
            .value=${session.title}
            @input=${(e: Event) => actions.setTitle((e.target as HTMLInputElement).value)}
          />
          ${icon("pencil", 14)}
        </label>
      </div>
      <button class="editor-share" ?disabled=${!canShare} @click=${actions.openShare}>${t("share")}</button>
    </header>

    ${segment(
      t("editorMode"),
      [
        { value: "build", label: t("editorBuild"), icon: "pencil" },
        { value: "test", label: t("testPlay"), icon: "play" },
      ],
      mode,
      (value) => (value === "test" ? canTest && actions.testPlay() : actions.backToEditor()),
    )}

    ${checkLine(model, hasSolver)}
    ${!canTest || model.verified || model.testPlay ? nothing : html`<p class="editor-hint">${t("statusNotVerified")}</p>`}

    ${model.testPlay
      ? html`<div class="editor-test">${model.testPlay}</div>`
      : html`<div class="editor-body">
          ${type.renderEditor({ data: currentData(session), update: actions.update, images: model.images })}
          <div class="editor-tools-bar">
            ${iconButton({ label: t("undo"), icon: "undo", onClick: actions.undo, disabled: !canUndoEdit(session) })}
            ${iconButton({ label: t("redo"), icon: "redo", onClick: actions.redo, disabled: !canRedoEdit(session) })}
          </div>
        </div>`}
    ${model.share
      ? shareDialog(model.share, actions.share, {
          publishing: model.publishing,
          username: model.username,
          minMoves: model.solve?.status === "solved" ? model.solve.moves.length : null,
          openPublish: actions.openPublish,
        })
      : nothing}
    ${model.publish ? publishDialog(model.publish, actions.publish) : nothing}
  `;
}

/** Live check as one status line: green when solvable, red with the reason when not. */
function checkLine(model: EditorViewModel, hasSolver: boolean) {
  const [tone, text]: [string, string] =
    model.problems.length > 0
      ? ["problem", `${t("problemsHeading")} ${model.problems[0]}`]
      : !hasSolver
        ? model.verified
          ? ["ok", t("statusVerified")]
          : ["", t("statusPlayable")]
        : solveLine(model.solve);
  return html`<div class="check-line ${tone}" role="status">
    ${icon(tone === "ok" ? "check" : tone === "problem" ? "alert" : "info", 18)}
    <span>${text}</span>
    ${model.problems.length > 1 ? html`<span class="check-more">+${model.problems.length - 1}</span>` : nothing}
  </div>
  ${model.problems.length > 1
    ? html`<ul class="problem-list">
        ${model.problems.slice(1).map((p) => html`<li>${p}</li>`)}
      </ul>`
    : nothing}`;
}

function solveLine(solve: SolveResult<unknown> | null): [string, string] {
  if (!solve) return ["", t("statusChecking")];
  switch (solve.status) {
    case "solved":
      return ["ok", solve.moves.length === 1 ? t("checkSolvableOne") : t("checkSolvable", { moves: solve.moves.length })];
    case "unsolvable":
      return ["problem", t("statusUnsolvable")];
    case "aborted":
      return ["", t("statusAborted")];
  }
}
