import { html } from "lit-html";
import type { Point } from "../../core/grid.ts";
import type { EditorContext } from "../../core/types.ts";
import { t } from "../../i18n/t.ts";
import type { MessageKey } from "../../i18n/t.ts";
import { gridEditor } from "../../ui/components/grid-editor.ts";
import type { PaletteItem } from "../../ui/components/grid-editor.ts";
import { applyTool, connect, drawPath, isTool, resize, scramble } from "./edit.ts";
import { LIMITS, findProblems, height, initState, isFixed, isSolved, maskAt, width } from "./logic.ts";
import type { PipesData, ProblemCode } from "./logic.ts";
import { boardLayers, shapeName } from "./render.ts";

// A function, so labels follow the language chosen at runtime (module constants were translated on import).
const palette = (): readonly PaletteItem[] => [
  { id: "pipe", label: t("ppToolPipe"), icon: "pipe", paint: true },
  { id: "source", label: t("ppToolSource"), icon: "source" },
  { id: "turn", label: t("ppToolTurn"), icon: "turn" },
  { id: "fixed", label: t("ppToolFixed"), icon: "fixed" },
  { id: "erase", label: t("ppToolErase"), icon: "erase", paint: true },
];

const PROBLEM_TEXT: Record<ProblemCode, MessageKey> = {
  "no-pipes": "ppProblemNoPipes",
  "source-empty": "ppProblemSourceEmpty",
};

export function problems(data: PipesData): string[] {
  const found = findProblems(data);
  const texts = found.map((p) => t(PROBLEM_TEXT[p.code]));
  if (found.length === 0 && isSolved(data, initState(data))) texts.push(t("ppProblemAlreadySolved"));
  return texts;
}

// Pipe drawing: a stroke arrives in several onPaint calls; the last cell of the previous call
// connects to the first cell of the next. With the keyboard, Enter on two neighbouring cells in a row connects them.
let stroke: { group: number; last: Point } | null = null;
let lastKeyCell: Point | null = null;

export function renderEditor(ctx: EditorContext<PipesData>) {
  const { data } = ctx;
  return html`
    <p class="hint">${t("ppEditorHint")}</p>
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
      board: boardLayers(data, undefined, { theme: ctx.theme }),
      label: t("ppEditorBoard"),
      onTap: (tool, x, y) => {
        if (!isTool(tool)) return;
        if (tool !== "pipe") {
          lastKeyCell = null;
          ctx.update(applyTool(data, tool, x, y));
          return;
        }
        const previous = lastKeyCell;
        lastKeyCell = { x, y };
        if (previous) ctx.update(connect(data, previous, { x, y }));
      },
      onPaint: (tool, cells, group) => {
        if (!isTool(tool)) return;
        if (tool === "pipe") {
          const path = stroke?.group === group ? [stroke.last, ...cells] : [...cells];
          stroke = { group, last: cells.at(-1)! };
          ctx.update(drawPath(data, path), group);
          return;
        }
        if (tool !== "erase") return;
        ctx.update(cells.reduce((d, c) => applyTool(d, tool, c.x, c.y), data), group);
      },
      describe: (x, y) => describeCell(data, x, y),
    })}
    <p>
      <button type="button" class="secondary" @click=${() => ctx.update(scramble(data, Math.random))}>
        ${t("ppScramble")}
      </button>
    </p>
  `;
}

function describeCell(data: PipesData, x: number, y: number): string {
  const mask = maskAt(data, x, y);
  const parts: string[] = [];
  if (mask) parts.push(t(shapeName(mask)));
  if (data.source.x === x && data.source.y === y) parts.push(t("ppSource"));
  if (mask && isFixed(data, x, y)) parts.push(t("ppFixed"));
  return parts.join(", ");
}
