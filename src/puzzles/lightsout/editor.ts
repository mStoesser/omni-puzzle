import { html } from "lit-html";
import type { EditorContext } from "../../core/types.ts";
import { t } from "../../i18n/t.ts";
import type { MessageKey } from "../../i18n/t.ts";
import { gridEditor } from "../../ui/components/grid-editor.ts";
import type { PaletteItem } from "../../ui/components/grid-editor.ts";
import { applyTool, isTool, resize } from "./edit.ts";
import { LIMITS, charAt, findProblems, height, initState, isSolved, width } from "./logic.ts";
import type { LightsOutData, ProblemCode } from "./logic.ts";
import { boardLayers } from "./render.ts";

// A function, so labels follow the language chosen at runtime (module constants were translated on import).
const palette = (): readonly PaletteItem[] => [
  { id: "press", label: t("loToolPress"), icon: "press" },
  { id: "light", label: t("loToolLight"), icon: "light", paint: true },
  { id: "hole", label: t("loToolHole"), icon: "hole", paint: true },
  { id: "erase", label: t("loToolErase"), icon: "erase", paint: true },
];

const PROBLEM_TEXT: Record<ProblemCode, MessageKey> = {
  "no-cells": "loProblemNoCells",
};

export function problems(data: LightsOutData): string[] {
  const found = findProblems(data);
  const texts = found.map((p) => t(PROBLEM_TEXT[p.code]));
  if (found.length === 0 && isSolved(data, initState(data))) texts.push(t("loProblemAlreadySolved"));
  return texts;
}

export function renderEditor(ctx: EditorContext<LightsOutData>) {
  const { data } = ctx;
  return html`
    <p class="hint">${t("loEditorHint")}</p>
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
      board: boardLayers(data, initState(data), { showHoles: true, theme: ctx.theme }),
      label: t("loEditorBoard"),
      onTap: (tool, x, y) => {
        if (isTool(tool)) ctx.update(applyTool(data, tool, x, y));
      },
      onPaint: (tool, cells, group) => {
        if (isTool(tool)) ctx.update(cells.reduce((d, c) => applyTool(d, tool, c.x, c.y), data), group);
      },
      describe: (x, y) => {
        const ch = charAt(data, x, y);
        return t(ch === "#" ? "loHole" : ch === "*" ? "loOn" : "loOff");
      },
    })}
  `;
}
