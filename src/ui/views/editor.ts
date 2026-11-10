import { html, nothing } from "lit-html";
import { canRedoEdit, canUndoEdit, currentData, readiness } from "../../core/editor-session.ts";
import type { EditorSession } from "../../core/editor-session.ts";
import { PUZZLE_LANGS } from "../../core/types.ts";
import { PUBLISH } from "../../core/publish.ts";
import { THEME_PRESETS } from "../../core/theme-presets.ts";
import type { PuzzleTheme, ThemeRole } from "../../core/puzzle-theme.ts";
import { contrastProblems, detailOn, sameColors } from "../../core/puzzle-theme.ts";
import { PIECE_ICONS } from "../../core/icon-catalog.ts";
import type { IconRole, PieceIcon } from "../../core/icon-catalog.ts";
import { pieceIcon } from "../piece-icons.ts";
import { SAVED_THEME_LIMITS } from "../../core/saved-themes.ts";
import type { SavedTheme } from "../../core/saved-themes.ts";
import type { AnyPuzzleType, EditorContext, PuzzleLang, SolveResult } from "../../core/types.ts";
import { LANG_NAMES, t, tn } from "../../i18n/t.ts";
import type { MessageKey } from "../../i18n/t.ts";
import { publishDialog } from "../components/publish-dialog.ts";
import type { PublishDialogActions, PublishDialogModel } from "../components/publish-dialog.ts";
import { shareDialog } from "../components/share-dialog.ts";
import { shortcutsButton } from "../components/shortcuts-dialog.ts";
import type { ShareDialogActions, ShareDialogModel } from "../components/share-dialog.ts";
import { iconButton, segment, typeVars } from "../components/ui.ts";
import { icon } from "../icons.ts";
import { buttonShortcut } from "../keyboard.ts";
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
  description: string; // M34: optional, for players and the gallery
  theme?: PuzzleTheme; // colors of the board (M29); undefined = default colors
  savedThemes: readonly SavedTheme[]; // own templates on this device (M30)
  themeNotice?: MessageKey; // why saving a template failed
  /** Test play inside the editor frame (segment "Probespielen"); null = building. */
  testPlay: TemplateResult | null;
};

export type EditorViewActions = {
  update(data: unknown, group?: number): void;
  undo(): void;
  redo(): void;
  setTitle(title: string): void;
  setDescription(description: string): void;
  setLanguage(lang: PuzzleLang): void;
  setTheme(theme: PuzzleTheme | undefined): void;
  saveTheme(name: string): void;
  renameTheme(id: string, name: string): void;
  deleteTheme(id: string): void;
  testPlay(): void;
  backToEditor(): void;
  openShare(): void;
  share: ShareDialogActions;
  openPublish(): void;
  publish: PublishDialogActions;
  openShortcuts(): void;
};

export function editorView(model: EditorViewModel, actions: EditorViewActions) {
  const { type, session } = model;
  const hasSolver = type.solve !== undefined;
  const { canTest, canShare } = readiness({ ...model, hasSolver });
  const mode = model.testPlay ? "test" : "build";
  const undoRedo = html`${iconButton({ label: t("undo"), icon: "undo", onClick: actions.undo, disabled: !canUndoEdit(session) || mode === "test", shortcut: buttonShortcut("undo") })}
  ${iconButton({ label: t("redo"), icon: "redo", onClick: actions.redo, disabled: !canRedoEdit(session) || mode === "test", shortcut: buttonShortcut("redo") })}`;
  const check = html`<section class="editor-check" aria-labelledby="editor-check-title">
    <h2 id="editor-check-title" class="desktop-only">${t("editorCheck")}</h2>
    ${checkLine(model, hasSolver)}
    ${model.solve?.status === "solved"
      ? html`<p class="check-fact desktop-only"><span>${t("editorShortest")}</span><strong>${tn("homeLevelMoves", model.solve.moves.length)}</strong></p>`
      : nothing}
    ${!canTest || model.verified || model.testPlay ? nothing : html`<p class="editor-hint">${t("statusNotVerified")}</p>`}
    ${shortcutsButton(actions.openShortcuts)}
  </section>`;
  // Language and theme come last: they matter once the puzzle is built (M29/M30).
  const appearance = html`<section class="editor-appearance" aria-labelledby="editor-appearance-title">
    <h2 id="editor-appearance-title" class="editor-appearance-title">${t("editorAppearance")}</h2>
    <label class="field editor-description">
      <span>${t("editorDescription")}</span>
      <textarea
        rows="3"
        maxlength=${PUBLISH.maxDescription}
        lang=${model.lang}
        .value=${model.description}
        @input=${(e: Event) => actions.setDescription((e.target as HTMLTextAreaElement).value)}
      ></textarea>
      <span class="hint">${t("editorDescriptionHint")}</span>
    </label>
    <label class="editor-lang">
      <span>${t("editorLanguage")}</span>
      <select @change=${(e: Event) => actions.setLanguage((e.target as HTMLSelectElement).value as PuzzleLang)}>
        ${PUZZLE_LANGS.map((lang) => html`<option value=${lang} lang=${lang} ?selected=${lang === model.lang}>${LANG_NAMES[lang]}</option>`)}
      </select>
    </label>
    ${type.themeRoles ? themePicker(type, model, actions) : nothing}
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
          ${type.renderEditor({ data: currentData(session), update: actions.update, images: model.images, theme: model.theme })}
          <div class="editor-tools-bar">
            <p class="label editor-tools-label">${t("tools")}</p>
            <span class="editor-tools-undo">${undoRedo}</span>
          </div>
          <h2 class="editor-settings-title desktop-only">${t("editorSettings")}</h2>
          ${appearance}
        </div>`}
    ${model.share
      ? shareDialog(model.share, actions.share, {
          publishing: model.publishing,
          username: model.username,
          minMoves: model.solve?.status === "solved" ? model.solve.moves.length : null,
          theme: !model.theme ? null : themeWarnings(type, model.theme).length === 0 ? "ok" : "low-contrast",
          openPublish: actions.openPublish,
        })
      : nothing}
    ${model.publish ? publishDialog(model.publish, actions.publish) : nothing}
  `;
}

/** A part's name in this type (e.g. "Boxes"), capitalized for labels; English names are lowercase for sentences. */
function partName(type: AnyPuzzleType, part: ThemeRole | "fixed"): string {
  const key = type.themeParts?.[part];
  return key ? t(key) : part;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Contrast warnings of the theme on this type (M30), as sentences; empty = fine. */
export function themeWarnings(type: AnyPuzzleType, theme: PuzzleTheme | undefined): string[] {
  if (!theme || !type.themeRoles) return [];
  // Several fixed colors (e.g. the three laser colors) share one name and one warning.
  const sentences = contrastProblems(theme, { roles: type.themeRoles, fixed: type.themeFixed }).map((p) =>
    capitalize(t("editorThemeLowContrast", p.b === "fixed" ? { a: partName(type, "fixed"), b: partName(type, p.a) } : { a: partName(type, p.a), b: partName(type, p.b) })),
  );
  return [...new Set(sentences)];
}

/**
 * Theme choice (M29): default colors, a preset or an own template, with a small preview of the colors this type uses.
 * M30: every color can be adjusted (live on the board, with contrast warnings) and saved as an own template.
 * A theme that matches nothing (e.g. after adjusting) stays selected as "custom".
 */
function themePicker(type: AnyPuzzleType, model: EditorViewModel, actions: EditorViewActions) {
  const roles = type.themeRoles ?? [];
  const { theme, savedThemes } = model;
  // Recognized by colors: picking icons keeps the preset or template selected (and puzzles from before M31 match).
  const preset = theme ? THEME_PRESETS.find((p) => sameColors(p.theme, theme)) : undefined;
  const saved = theme && !preset ? savedThemes.find((p) => sameColors(p.theme, theme)) : undefined;
  const value = !theme ? "" : preset ? preset.id : saved ? `own:${saved.id}` : "custom";
  const choose = (e: Event) => {
    const id = (e.target as HTMLSelectElement).value;
    if (id === "custom") return;
    const own = id.startsWith("own:") ? savedThemes.find((p) => `own:${p.id}` === id) : undefined;
    actions.setTheme(own?.theme ?? THEME_PRESETS.find((p) => p.id === id)?.theme);
  };
  const warnings = themeWarnings(type, theme);
  return html`<div class="editor-theme">
    <label class="editor-lang">
      <span>${t("editorTheme")}</span>
      <select aria-describedby="editor-theme-hint" @change=${choose}>
        <option value="" ?selected=${value === ""}>${t("puzzleThemeDefault")}</option>
        <optgroup label=${t("editorThemePresets")}>
          ${THEME_PRESETS.map((p) => html`<option value=${p.id} ?selected=${value === p.id}>${t(p.name)}</option>`)}
        </optgroup>
        ${savedThemes.length > 0
          ? html`<optgroup label=${t("editorThemeMine")}>
              ${savedThemes.map((p) => html`<option value="own:${p.id}" ?selected=${value === `own:${p.id}`}>${p.name}</option>`)}
            </optgroup>`
          : nothing}
        ${value === "custom" ? html`<option value="custom" selected>${t("puzzleThemeCustom")}</option>` : nothing}
      </select>
    </label>
    ${theme
      ? html`<span class="theme-swatches" style="background: ${theme.colors.board}" aria-hidden="true">
          ${roles.filter((r) => r !== "board").map((r) => html`<span class="theme-swatch" style="background: ${theme.colors[r]}"></span>`)}
        </span>`
      : nothing}
    <div class="theme-warnings" role="status">
      ${warnings.length > 0
        ? html`<ul>${warnings.map((w) => html`<li>${icon("alert", 16)}<span>${w}</span></li>`)}</ul>
            <p>${t("editorThemeBlocked")}</p>`
        : nothing}
    </div>
    ${theme ? themeColors(type, theme, saved, model.themeNotice, actions) : nothing}
    ${theme && type.iconRoles ? themeIcons(type.iconRoles, theme, actions) : nothing}
    <p id="editor-theme-hint" class="editor-hint">${t("editorThemeHint")}</p>
  </div>`;
}

/** Native color inputs per role (the board shows every change at once), and saving as an own template. */
function themeColors(type: AnyPuzzleType, theme: PuzzleTheme, saved: SavedTheme | undefined, notice: MessageKey | undefined, actions: EditorViewActions) {
  const nameOf = (e: Event) => ((e.target as Element).closest(".theme-save")?.querySelector("input")?.value ?? "");
  const setColor = (role: ThemeRole) => (e: Event) =>
    actions.setTheme({ colors: { ...theme.colors, [role]: (e.target as HTMLInputElement).value } });
  return html`<details class="theme-edit">
    <summary>${icon("pencil", 16)}${t("editorThemeColors")}</summary>
    <div class="theme-colors">
      ${(type.themeRoles ?? []).map(
        (role) => html`<label class="theme-color">
          <input type="color" .value=${theme.colors[role]} @input=${setColor(role)} />
          <span>${capitalize(partName(type, role))}</span>
        </label>`,
      )}
    </div>
    <div class="theme-save">
      <label>
        <span>${t("editorThemeName")}</span>
        <input type="text" maxlength=${SAVED_THEME_LIMITS.maxName} .value=${saved?.name ?? ""} />
      </label>
      <div class="theme-save-actions">
        ${saved
          ? html`<button type="button" class="secondary" @click=${(e: Event) => actions.renameTheme(saved.id, nameOf(e))}>${t("editorThemeRename")}</button>
              <button type="button" class="secondary danger" @click=${() => confirm(t("editorThemeDeleteAsk", { name: saved.name })) && actions.deleteTheme(saved.id)}>
                ${t("editorThemeDelete")}
              </button>`
          : html`<button type="button" class="secondary" @click=${(e: Event) => actions.saveTheme(nameOf(e))}>${t("editorThemeSave")}</button>`}
      </div>
      ${notice ? html`<p class="status-problem" role="alert">${t(notice)}</p>` : nothing}
    </div>
  </details>`;
}

const ICON_ROLE_NAMES: Record<IconRole, MessageKey> = {
  figure: "iconRoleFigure",
  box: "iconRoleBox",
  goal: "iconRoleGoal",
  rock: "iconRoleRock",
  lamp: "iconRoleLamp",
};

const ICON_NAMES: Record<PieceIcon, MessageKey> = {
  cat: "iconCat", robot: "iconRobot", penguin: "iconPenguin", ghost: "iconGhost", gift: "iconGift", apple: "iconApple",
  barrel: "iconBarrel", star: "iconStar", flag: "iconFlag", flower: "iconFlower", tree: "iconTree", cactus: "iconCactus",
  rock: "iconRock", sun: "iconSun", moon: "iconMoon",
};

/** Which theme color an icon role is drawn in (as on the board). */
const ICON_COLOR: Record<IconRole, ThemeRole> = { figure: "figure", box: "piece", goal: "target", rock: "wall", lamp: "done" };

/** M31: an icon per icon role from the catalog, or the type's own drawing ("default"). Native radio buttons. */
function themeIcons(roles: readonly IconRole[], theme: PuzzleTheme, actions: EditorViewActions) {
  const choose = (role: IconRole, id: PieceIcon | null) => {
    const icons = { ...theme.icons };
    if (id) icons[role] = id;
    else delete icons[role];
    actions.setTheme(Object.keys(icons).length > 0 ? { colors: theme.colors, icons } : { colors: theme.colors });
  };
  return html`<details class="theme-edit">
    <summary>${icon("puzzle", 16)}${t("editorThemeIcons")}</summary>
    ${roles.map((role) => {
      const main = theme.colors[ICON_COLOR[role]];
      const style = `background: ${theme.colors.board}; --icon-main: ${main}; --icon-detail: ${detailOn(main)}`;
      const current = theme.icons?.[role];
      return html`<fieldset class="icon-choices">
        <legend>${t(ICON_ROLE_NAMES[role])}</legend>
        <label class="icon-choice">
          <input type="radio" name="icon-${role}" .checked=${current === undefined} @change=${() => choose(role, null)} />
          <span class="icon-choice-face" style=${style}><span class="icon-default">${t("editorThemeIconDefault")}</span></span>
        </label>
        ${PIECE_ICONS.map(
          (id) => html`<label class="icon-choice" title=${t(ICON_NAMES[id])}>
            <input type="radio" name="icon-${role}" .checked=${current === id} @change=${() => choose(role, id)} />
            <span class="icon-choice-face" style=${style}>
              <svg viewBox="0 0 100 100" role="img" aria-label=${t(ICON_NAMES[id])}>${pieceIcon(id, 0, 0, 100)}</svg>
            </span>
          </label>`,
        )}
      </fieldset>`;
    })}
  </details>`;
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
