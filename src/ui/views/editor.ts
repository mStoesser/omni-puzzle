import { html, nothing } from "lit-html";
import { canRedoEdit, canUndoEdit, currentData, readiness } from "../../core/editor-session.ts";
import type { EditorSession } from "../../core/editor-session.ts";
import { PUZZLE_LANGS } from "../../core/types.ts";
import type { AnyPuzzleType, EditorContext, PuzzleLang, SolveResult } from "../../core/types.ts";
import { LANG_NAMES, t, tn } from "../../i18n/t.ts";
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
  lang: PuzzleLang; // language of the puzzle's texts (M28), preset to the UI language
  /** Test play inside the editor frame (segment "Probespielen"); null = building. */
  testPlay: TemplateResult | null;
};

export type EditorViewActions = {
  update(data: unknown, group?: number): void;
  undo(): void;
  redo(): void;
  setTitle(title: string): void;
  setLanguage(lang: PuzzleLang): void;
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
  const undoRedo = html`${iconButton({ label: t("undo"), icon: "undo", onClick: actions.undo, disabled: !canUndoEdit(session) || mode === "test" })}
  ${iconButton({ label: t("redo"), icon: "redo", onClick: actions.redo, disabled: !canRedoEdit(session) || mode === "test" })}`;
  const check = html`<section class="editor-check" aria-labelledby="editor-check-title">
    <h2 id="editor-check-title" class="desktop-only">${t("editorCheck")}</h2>
    ${checkLine(model, hasSolver)}
    ${model.solve?.status === "solved"
      ? html`<p class="check-fact desktop-only"><span>${t("editorShortest")}</span><strong>${tn("homeLevelMoves", model.solve.moves.length)}</strong></p>`
      : nothing}
    ${!canTest || model.verified || model.testPlay ? nothing : html`<p class="editor-hint">${t("statusNotVerified")}</p>`}
    <label class="editor-lang">
      <span>${t("editorLanguage")}</span>
      <select @change=${(e: Event) => actions.setLanguage((e.target as HTMLSelectElement).value as PuzzleLang)}>
        ${PUZZLE_LANGS.map((lang) => html`<option value=${lang} lang=${lang} ?selected=${lang === model.lang}>${LANG_NAMES[lang]}</option>`)}
      </select>
    </label>
  </section>`;
  return html`
    <header class="editor-head">
      ${iconButton({ label: t("editorClose"), icon: "close", href: "#/library" })}
      <div class="editor-title typed" style=${typeVars(type)}>
        <span class="play-kicker"
          >${t(type.name)} · <span class="kicker-status">${model.verified ? t("editorReady") : t("libraryDraft")}</span
          ><span class="level-long"> · ${t("editorAutosaved")}</span></span
        >
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
      <div class="editor-mode">
        ${segment(
          t("editorMode"),
          [
            { value: "build", label: t("editorBuild"), icon: "pencil" },
            { value: "test", label: t("testPlay"), icon: "play" },
          ],
          mode,
          (value) => (value === "test" ? canTest && actions.testPlay() : actions.backToEditor()),
        )}
      </div>
      <div class="editor-head-undo desktop-flex">${undoRedo}</div>
      <button class="editor-share" ?disabled=${!canShare} @click=${actions.openShare}>${t("share")}</button>
    </header>

    ${model.testPlay
      ? html`${check}<div class="editor-test">${model.testPlay}</div>`
      : html`<div class="editor-body">
          ${check}
          ${type.renderEditor({ data: currentData(session), update: actions.update, images: model.images })}
          <div class="editor-tools-bar">
            <p class="label editor-tools-label">${t("tools")}</p>
            <span class="editor-tools-undo">${undoRedo}</span>
          </div>
          <h2 class="editor-settings-title desktop-only">${t("editorSettings")}</h2>
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
      return ["ok", tn("checkSolvable", solve.moves.length)];
    case "unsolvable":
      return ["problem", t("statusUnsolvable")];
    case "aborted":
      return ["", t("statusAborted")];
  }
}
