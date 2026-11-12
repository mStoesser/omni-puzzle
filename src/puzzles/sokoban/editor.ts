import { html } from "lit-html";
import type { EditorContext } from "../../core/types.ts";
import { t } from "../../i18n/t.ts";
import type { MessageKey } from "../../i18n/t.ts";
import { gridEditor } from "../../ui/components/grid-editor.ts";
import type { PaletteItem } from "../../ui/components/grid-editor.ts";
import { applyTool, isTool, resize } from "./edit.ts";
import { LIMITS, charAt, findProblems, height, initState, isSolved, width } from "./logic.ts";
import type { ProblemCode, SokobanData } from "./logic.ts";
import { boardLayers } from "./render.ts";

// A function, so labels follow the language chosen at runtime (module constants were translated on import).
const palette = (): readonly PaletteItem[] => [
  { id: "wall", label: t("skToolWall"), icon: "wall", paint: true },
  { id: "box", label: t("skToolBox"), icon: "box" },
  { id: "goal", label: t("skToolGoal"), icon: "goal" },
  { id: "player", label: t("skToolPlayer"), icon: "player" },
  { id: "erase", label: t("skToolErase"), icon: "erase", paint: true },
];

const PROBLEM_TEXT: Record<ProblemCode, MessageKey> = {
  "no-player": "skProblemNoPlayer",
  "multiple-players": "skProblemMultiplePlayers",
  "no-boxes": "skProblemNoBoxes",
  "box-goal-count": "skProblemBoxGoalCount",
};

export function problems(data: SokobanData): string[] {
  const found = findProblems(data);
  const texts = [...new Set(found.map((p) => t(PROBLEM_TEXT[p.code])))];
  if (found.length === 0 && isSolved(data, initState(data))) texts.push(t("skProblemAlreadySolved"));
  return texts;
}

export function renderEditor(ctx: EditorContext<SokobanData>) {
  const { data } = ctx;
  const problemCells = new Set(findProblems(data).flatMap((p) => (p.cell === undefined ? [] : [p.cell])));
  return html`
    <p class="hint">${t("skEditorHint")}</p>
    ${gridEditor({
      width: width(data),
      height: height(data),
      ring: false,
      size: {
        min: LIMITS.minSize,
        max: LIMITS.maxSize,
        onResize: (w, h) => ctx.update(resize(data, w, h)),
      },
      palette: palette(),
      board: boardLayers(data, initState(data), { problemCells, theme: ctx.theme }),
      label: t("skEditorBoard"),
      onTap: (tool, x, y) => {
        if (isTool(tool)) ctx.update(applyTool(data, tool, x, y));
      },
      onPaint: (tool, cells, group) => {
        if (isTool(tool)) ctx.update(cells.reduce((d, c) => applyTool(d, tool, c.x, c.y), data), group);
      },
      describe: (x, y) => describeCell(charAt(data, x, y)),
    })}
  `;
}

const CELL_TEXT: Record<string, MessageKey | null> = {
  "#": "skToolWall",
  " ": null,
  ".": "skToolGoal",
  $: "skToolBox",
  "*": "skBoxOnGoal",
  "@": "skToolPlayer",
  "+": "skPlayerOnGoal",
};

function describeCell(ch: string): string {
  const key = CELL_TEXT[ch];
  return key ? t(key) : "";
}
