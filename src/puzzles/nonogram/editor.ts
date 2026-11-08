import { html } from "lit-html";
import type { EditorContext } from "../../core/types.ts";
import { t } from "../../i18n/t.ts";
import type { MessageKey } from "../../i18n/t.ts";
import { gridEditor } from "../../ui/components/grid-editor.ts";
import type { PaletteItem } from "../../ui/components/grid-editor.ts";
import { applyTool, editorImage, isTool, resize } from "./edit.ts";
import { LIMITS, analyze, findProblems } from "./logic.ts";
import type { NonogramData, ProblemCode } from "./logic.ts";
import { cluePreview, editorLayers } from "./render.ts";

const PALETTE: readonly PaletteItem[] = [
  { id: "fill", label: t("ngToolFill"), icon: "■", paint: true },
  { id: "erase", label: t("ngToolErase"), icon: "⌫", paint: true },
];

const PROBLEM_TEXT: Record<ProblemCode, MessageKey> = {
  "clue-too-long": "ngProblemClueTooLong",
  "count-mismatch": "ngProblemCountMismatch",
  unsolvable: "ngProblemUnsolvable",
  ambiguous: "ngProblemAmbiguous",
  "too-hard": "ngProblemTooHard",
};

export function problems(data: NonogramData): string[] {
  if (data.rows.every((clue) => clue.length === 0)) return [t("ngProblemEmpty")];
  return findProblems(data).map((p) => t(PROBLEM_TEXT[p.code]));
}

export function renderEditor(ctx: EditorContext<NonogramData>) {
  const { data } = ctx;
  const image = editorImage(data);
  // Ambiguous clues: frame the cells where two fitting pictures differ.
  const result = analyze(data);
  const marked = new Set<number>();
  if (result.status === "multiple") {
    const [a, b] = result.solutions;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) marked.add(i);
  }
  return html`
    <p class="hint">${t("ngEditorHint")}</p>
    ${gridEditor({
      width: data.width,
      height: data.height,
      ring: false,
      size: {
        min: LIMITS.minSize,
        max: LIMITS.maxSize,
        onResize: (w, h) => ctx.update(resize(data, w, h)),
      },
      palette: PALETTE,
      board: editorLayers(data, image, marked, ctx.theme),
      label: t("ngEditorBoard"),
      onTap: (tool, x, y) => {
        if (isTool(tool)) ctx.update(applyTool(data, tool, x, y, true));
      },
      onPaint: (tool, cells, group) => {
        if (isTool(tool)) ctx.update(cells.reduce((d, c) => applyTool(d, tool, c.x, c.y), data), group);
      },
      describe: (x, y) => (image[y]![x] === "#" ? t("ngFilled") : ""),
    })}
    <details class="ng-preview">
      <summary>${t("ngCluePreview")}</summary>
      ${cluePreview(data, image, ctx.theme)}
    </details>
  `;
}
