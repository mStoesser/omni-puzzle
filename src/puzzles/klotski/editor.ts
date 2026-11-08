import { html } from "lit-html";
import type { EditorContext } from "../../core/types.ts";
import { t } from "../../i18n/t.ts";
import type { MessageKey } from "../../i18n/t.ts";
import { gridEditor } from "../../ui/components/grid-editor.ts";
import type { PaletteItem } from "../../ui/components/grid-editor.ts";
import { applyTool, blockAt, isTool, resize } from "./edit.ts";
import { LIMITS, exitSpan, findProblems, initState, isSolved } from "./logic.ts";
import type { KlotskiData, ProblemCode } from "./logic.ts";
import { boardLayers } from "./render.ts";

// A function, so labels follow the language chosen at runtime (module constants were translated on import).
const palette = (): readonly PaletteItem[] => [
  { id: "block11", label: t("klToolBlock11"), icon: "▪" },
  { id: "block21", label: t("klToolBlock21"), icon: "▬" },
  { id: "block12", label: t("klToolBlock12"), icon: "▮" },
  { id: "block22", label: t("klToolBlock22"), icon: "■" },
  { id: "target", label: t("klToolTarget"), icon: "🟥" },
  { id: "exit", label: t("klToolExit"), icon: "⇥" },
  { id: "erase", label: t("klToolErase"), icon: "⌫", paint: true },
];

const PROBLEM_TEXT: Record<ProblemCode, MessageKey> = {
  "out-of-bounds": "klProblemOutOfBounds",
  overlap: "klProblemOverlap",
  "duplicate-id": "klProblemDuplicateId",
  "no-target": "klProblemNoTarget",
  "multiple-targets": "klProblemMultipleTargets",
  "exit-out-of-bounds": "klProblemExitOutOfBounds",
};

export function problems(data: KlotskiData): string[] {
  const found = findProblems(data);
  const texts = [...new Set(found.map((p) => t(PROBLEM_TEXT[p.code])))];
  if (found.length === 0 && isSolved(data, initState(data))) texts.push(t("klProblemAlreadySolved"));
  return texts;
}

export function renderEditor(ctx: EditorContext<KlotskiData>) {
  const { data } = ctx;
  const problemBlocks = new Set(findProblems(data).flatMap((p) => (p.block === undefined ? [] : [p.block])));
  return html`
    <p class="hint">${t("klEditorHint")}</p>
    ${gridEditor({
      width: data.width,
      height: data.height,
      ring: true,
      size: {
        min: LIMITS.minSize,
        max: LIMITS.maxSize,
        onResize: (width, height) => ctx.update(resize(data, width, height)),
      },
      palette: palette(),
      // Positions straight from the data: drafts may have blocks outside the board.
      board: boardLayers(data, data.blocks, { problemBlocks, theme: ctx.theme }),
      label: t("klEditorBoard"),
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

function describeCell(data: KlotskiData, x: number, y: number): string {
  if (x < 0 || y < 0 || x >= data.width || y >= data.height) return isExit(data, x, y) ? t("klToolExit") : "";
  const hit = blockAt(data, x, y);
  if (hit < 0) return "";
  const block = data.blocks[hit]!;
  return block.target ? `${t("klToolTarget")}, ${block.w} × ${block.h}` : t("klBlock", { size: `${block.w} × ${block.h}` });
}

function isExit(data: KlotskiData, x: number, y: number): boolean {
  const { side, index } = data.exit;
  const along = side === "N" || side === "S" ? x : y;
  const onSide =
    side === "E" ? x === data.width : side === "W" ? x === -1 : side === "N" ? y === -1 : y === data.height;
  return onSide && along >= index && along < index + exitSpan(data);
}
