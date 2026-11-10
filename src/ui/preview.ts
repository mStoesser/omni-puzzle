import { html } from "lit-html";
import type { TemplateResult } from "lit-html";

/**
 * The <svg> of a card preview (M32, PuzzleType.renderPreview): fills its box and keeps the board's aspect ratio.
 * Only a picture: hidden from screen readers (the card names the puzzle), not focusable, no pointer handling.
 */
export function previewSvg(viewBox: readonly [number, number, number, number], content: unknown): TemplateResult {
  return html`<svg class="preview-board" viewBox=${viewBox.join(" ")} preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false"
    >${content}</svg
  >`;
}
