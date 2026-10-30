import { html } from "lit-html";
import type { EditorContext } from "../../core/types.ts";
import { t } from "../../i18n/t.ts";
import type { MessageKey } from "../../i18n/t.ts";
import { gridEditor } from "../../ui/components/grid-editor.ts";
import type { PaletteItem } from "../../ui/components/grid-editor.ts";
import { applyTool, blockAt, isTool, resize } from "./edit.ts";
import { LIMITS, findProblems, initState, isSolved } from "./logic.ts";
import type { ProblemCode, RushHourData } from "./logic.ts";
import { boardLayers } from "./render.ts";

const PALETTE: readonly PaletteItem[] = [
  { id: "block2", label: t("rhToolBlock2"), icon: "▭" },
  { id: "block3", label: t("rhToolBlock3"), icon: "▬" },
  { id: "target", label: t("rhToolTarget"), icon: "🟥" },
  { id: "exit", label: t("rhToolExit"), icon: "⇥" },
  { id: "erase", label: t("rhToolErase"), icon: "⌫" },
];

const PROBLEM_TEXT: Record<ProblemCode, MessageKey> = {
  "out-of-bounds": "rhProblemOutOfBounds",
  overlap: "rhProblemOverlap",
  "duplicate-id": "rhProblemDuplicateId",
  "no-target": "rhProblemNoTarget",
  "multiple-targets": "rhProblemMultipleTargets",
  "exit-out-of-bounds": "rhProblemExitOutOfBounds",
  "exit-axis": "rhProblemExitAxis",
  "exit-lane": "rhProblemExitLane",
};

export function problems(data: RushHourData): string[] {
  const found = findProblems(data);
  const texts = [...new Set(found.map((p) => t(PROBLEM_TEXT[p.code])))];
  if (found.length === 0 && isSolved(data, initState(data))) texts.push(t("rhProblemAlreadySolved"));
  return texts;
}

export function renderEditor(ctx: EditorContext<RushHourData>) {
  const { data } = ctx;
  const problemBlocks = new Set(findProblems(data).flatMap((p) => (p.block === undefined ? [] : [p.block])));
  return html`
    <p class="hint">${t("rhEditorHint")}</p>
    ${gridEditor({
      width: data.width,
      height: data.height,
      ring: true,
      size: {
        min: LIMITS.minSize,
        max: LIMITS.maxSize,
        onResize: (width, height) => ctx.update(resize(data, width, height)),
      },
      palette: PALETTE,
      // initState only reads block positions, so it is safe for data with problems.
      board: boardLayers(data, initState(data), { problemBlocks }),
      label: t("rhEditorBoard"),
      onTap: (tool, x, y) => {
        if (isTool(tool)) ctx.update(applyTool(data, tool, x, y));
      },
      describe: (x, y) => describeCell(data, x, y),
    })}
  `;
}

function describeCell(data: RushHourData, x: number, y: number): string {
  if (x < 0 || y < 0 || x >= data.width || y >= data.height) return isExit(data, x, y) ? t("rhToolExit") : "";
  const hit = blockAt(data, x, y);
  if (hit < 0) return "";
  const block = data.blocks[hit]!;
  const axis = t(block.axis === "h" ? "rhHorizontal" : "rhVertical");
  return `${block.target ? t("rhToolTarget") : t(block.length === 3 ? "rhToolBlock3" : "rhToolBlock2")}, ${axis}`;
}

function isExit(data: RushHourData, x: number, y: number): boolean {
  const { side, index } = data.exit;
  if (side === "E") return x === data.width && y === index;
  if (side === "W") return x === -1 && y === index;
  if (side === "N") return y === -1 && x === index;
  return y === data.height && x === index;
}
