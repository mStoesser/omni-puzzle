import { html } from "lit-html";
import type { EditorContext } from "../../core/types.ts";
import { t } from "../../i18n/t.ts";
import type { MessageKey } from "../../i18n/t.ts";
import { gridEditor } from "../../ui/components/grid-editor.ts";
import type { PaletteItem } from "../../ui/components/grid-editor.ts";
import { applyTool, isTool, resize } from "./edit.ts";
import { LIMITS, cellAt, findProblems, initState, isSolved } from "./logic.ts";
import type { IceData, IceKind, ProblemCode } from "./logic.ts";
import { boardLayers } from "./render.ts";

// A function, so labels follow the language chosen at runtime (module constants were translated on import).
const palette = (): readonly PaletteItem[] => [
  { id: "wall", label: t("iceToolWall"), icon: "■", paint: true },
  { id: "sand", label: t("iceToolSand"), icon: "░", paint: true },
  { id: "start", label: t("iceToolStart"), icon: "●" },
  { id: "goal", label: t("iceToolGoal"), icon: "◎" },
  { id: "erase", label: t("iceToolErase"), icon: "⌫", paint: true },
];

const PROBLEM_TEXT: Record<ProblemCode, MessageKey> = {
  "out-of-bounds": "iceProblemOutOfBounds",
  "duplicate-cell": "iceProblemDuplicate",
  "no-start": "iceProblemNoStart",
  "multiple-starts": "iceProblemMultipleStarts",
  "no-goal": "iceProblemNoGoal",
};

export function problems(data: IceData): string[] {
  const found = findProblems(data);
  const texts = [...new Set(found.map((p) => t(PROBLEM_TEXT[p.code])))];
  if (found.length === 0 && isSolved(data, initState(data))) texts.push(t("iceProblemAlreadySolved"));
  return texts;
}

export function renderEditor(ctx: EditorContext<IceData>) {
  const { data } = ctx;
  const problemCells = new Set(findProblems(data).flatMap((p) => (p.cell === undefined ? [] : [p.cell])));
  return html`
    <p class="hint">${t("iceEditorHint")}</p>
    ${gridEditor({
      width: data.width,
      height: data.height,
      ring: false,
      size: {
        min: LIMITS.minSize,
        max: LIMITS.maxSize,
        onResize: (width, height) => ctx.update(resize(data, width, height)),
      },
      palette: palette(),
      // The figure stands on the start cell.
      board: boardLayers(data, initState(data), { problemCells, theme: ctx.theme }),
      label: t("iceEditorBoard"),
      onTap: (tool, x, y) => {
        if (isTool(tool)) ctx.update(applyTool(data, tool, x, y));
      },
      onPaint: (tool, cells, group) => {
        if (isTool(tool)) ctx.update(cells.reduce((d, c) => applyTool(d, tool, c.x, c.y), data), group);
      },
      describe: (x, y) => describeCell(data, x, y),
    })}
  `;
}

const KIND_TEXT: Record<IceKind, MessageKey> = {
  wall: "iceToolWall",
  sand: "iceToolSand",
  start: "iceToolStart",
  goal: "iceToolGoal",
};

function describeCell(data: IceData, x: number, y: number): string {
  const index = cellAt(data, x, y);
  return index < 0 ? "" : t(KIND_TEXT[data.cells[index]!.kind]);
}
