import { html } from "lit-html";
import type { EditorContext } from "../../core/types.ts";
import { t } from "../../i18n/t.ts";
import type { MessageKey } from "../../i18n/t.ts";
import { gridEditor } from "../../ui/components/grid-editor.ts";
import type { PaletteItem } from "../../ui/components/grid-editor.ts";
import { applyTool, isTool, resize } from "./edit.ts";
import { LIMITS, findProblems, initState, isSolved } from "./logic.ts";
import type { LaserData, ProblemCode } from "./logic.ts";
import { boardLayers } from "./render.ts";

const PALETTE: readonly PaletteItem[] = [
  { id: "emitter", label: t("lsToolEmitter"), icon: "🔦" },
  { id: "target", label: t("lsToolTarget"), icon: "◎" },
  { id: "rotatable", label: t("lsToolRotatable"), icon: "↻" },
  { id: "mirror", label: t("lsToolMirror"), icon: "⟋" },
  { id: "wall", label: t("lsToolWall"), icon: "■" },
  { id: "erase", label: t("lsToolErase"), icon: "⌫" },
];

const PROBLEM_TEXT: Record<ProblemCode, MessageKey> = {
  "out-of-bounds": "lsProblemOutOfBounds",
  "duplicate-cell": "lsProblemDuplicate",
  "no-emitter": "lsProblemNoEmitter",
  "no-target": "lsProblemNoTarget",
};

export function problems(data: LaserData): string[] {
  const found = findProblems(data);
  const texts = [...new Set(found.map((p) => t(PROBLEM_TEXT[p.code])))];
  if (found.length === 0 && isSolved(data, initState(data))) texts.push(t("lsProblemAlreadySolved"));
  return texts;
}

export function renderEditor(ctx: EditorContext<LaserData>) {
  const { data } = ctx;
  const problemCells = new Set(findProblems(data).flatMap((p) => (p.cell === undefined ? [] : [p.cell])));
  return html`
    <p class="hint">${t("lsEditorHint")}</p>
    ${gridEditor({
      width: data.width,
      height: data.height,
      ring: false,
      size: {
        min: LIMITS.minSize,
        max: LIMITS.maxSize,
        onResize: (width, height) => ctx.update(resize(data, width, height)),
      },
      palette: PALETTE,
      // Shows the beams of the start position, so the creator sees what the player sees.
      board: boardLayers(data, initState(data), { problemCells }),
      label: t("lsEditorBoard"),
      onTap: (tool, x, y) => {
        if (isTool(tool)) ctx.update(applyTool(data, tool, x, y));
      },
    })}
  `;
}
