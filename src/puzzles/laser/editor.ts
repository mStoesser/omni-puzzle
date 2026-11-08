import { html } from "lit-html";
import type { EditorContext } from "../../core/types.ts";
import { t } from "../../i18n/t.ts";
import type { MessageKey } from "../../i18n/t.ts";
import { gridEditor } from "../../ui/components/grid-editor.ts";
import type { PaletteItem } from "../../ui/components/grid-editor.ts";
import { applyTool, isTool, resize, setInventory } from "./edit.ts";
import { LIMITS, findProblems, initState, isSolved } from "./logic.ts";
import type { LaserData, ProblemCode } from "./logic.ts";
import { boardLayers, describeCell } from "./render.ts";

// In groups, so the tool grid stays clear on a phone. The inventory is a number in the settings.
// A function, so labels follow the language chosen at runtime (module constants were translated on import).
const palette = (): readonly PaletteItem[] => [
  { id: "emitter", label: t("lsToolEmitter"), icon: "🔦", group: t("lsGroupBasics") },
  { id: "target", label: t("lsToolTarget"), icon: "◎", group: t("lsGroupBasics") },
  { id: "rotatable", label: t("lsToolRotatable"), icon: "↻", group: t("lsGroupBasics") },
  { id: "mirror", label: t("lsToolMirror"), icon: "⟋", group: t("lsGroupBasics") },
  { id: "wall", label: t("lsToolWall"), icon: "■", paint: true, group: t("lsGroupBasics") },
  { id: "erase", label: t("lsToolErase"), icon: "⌫", paint: true, group: t("lsGroupBasics") },
  { id: "rotatableSplitter", label: t("lsToolRotatableSplitter"), icon: "⤨", group: t("lsGroupSplitters") },
  { id: "splitter", label: t("lsToolSplitter"), icon: "⋰", group: t("lsGroupSplitters") },
  { id: "filter", label: t("lsToolFilter"), icon: "▣", group: t("lsGroupColors") },
  { id: "color", label: t("lsToolColor"), icon: "🎨", group: t("lsGroupColors") },
];

const PROBLEM_TEXT: Record<ProblemCode, MessageKey> = {
  "out-of-bounds": "lsProblemOutOfBounds",
  "duplicate-cell": "lsProblemDuplicate",
  "no-emitter": "lsProblemNoEmitter",
  "no-target": "lsProblemNoTarget",
  "missing-color": "lsProblemMissingColor",
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
      settings: [
        {
          label: t("lsInventory"),
          value: data.inventory ?? 0,
          min: 0,
          max: LIMITS.maxInventory,
          set: (count) => ctx.update(setInventory(data, count)),
        },
      ],
      palette: palette(),
      // Shows the beams of the start position, so the creator sees what the player sees.
      board: boardLayers(data, initState(data), { problemCells, theme: ctx.theme }),
      label: t("lsEditorBoard"),
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
