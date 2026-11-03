import { html } from "lit-html";
import { keyDir, swipeDir } from "../../core/grid.ts";
import type { Dir } from "../../core/grid.ts";
import { t } from "../../i18n/t.ts";
import type { MessageKey } from "../../i18n/t.ts";
import { icon } from "../icons.ts";
import type { IconName } from "../icons.ts";

// Direction input for puzzles with a moving figure (ice sliding, Sokoban …): swipes, arrow keys / WASD
// and an on-screen pad. Usage on the board (an SVG, so touch-action is already none):
//   @pointerdown=${swipeStart} @pointerup=${(e) => { const end = swipeEnd(e); if (end && end !== "tap") move(end); }}
//   @pointercancel=${swipeCancel} @keydown=${(e) => { const dir = directionKey(e); if (dir) move(dir); }}

/** Minimum swipe length in CSS pixels; shorter gestures count as taps. */
export const SWIPE_MIN = 24;

let start: { pointerId: number; x: number; y: number } | null = null;

export function swipeStart(e: PointerEvent) {
  if (!e.isPrimary || e.button !== 0) return;
  // The pointer stays captured (implicitly for touch), so the swipe ends here even outside the board.
  start = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
}

/**
 * How the gesture ending with this pointerup went: a swipe direction, "tap" (moved less than SWIPE_MIN),
 * or null (no matching pointerdown, e.g. another finger, or an exactly diagonal swipe).
 */
export function swipeEnd(e: PointerEvent): Dir | "tap" | null {
  const begun = start;
  start = null;
  if (!begun || begun.pointerId !== e.pointerId) return null;
  const dx = e.clientX - begun.x;
  const dy = e.clientY - begun.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) return "tap";
  return swipeDir(dx, dy, SWIPE_MIN);
}

export function swipeCancel() {
  start = null;
}

/** Direction for arrow keys and WASD; prevents scrolling. Key combinations (Ctrl+Z, Ctrl+S …) are left alone. */
export function directionKey(e: KeyboardEvent): Dir | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const dir = keyDir(e.key);
  if (dir) e.preventDefault();
  return dir;
}

const PAD: readonly { dir: Dir; text: MessageKey; icon: IconName }[] = [
  { dir: "N", text: "moveN", icon: "chevronUp" },
  { dir: "W", text: "moveW", icon: "chevronLeft" },
  { dir: "E", text: "moveE", icon: "chevronRight" },
  { dir: "S", text: "moveS", icon: "chevronDown" },
];

/** Four direction buttons in a cross, for players who cannot swipe or use a keyboard. */
export function directionPad(onDir: (dir: Dir) => void, disabled = false) {
  return html`<div class="direction-pad" role="group" aria-label=${t("directionPad")}>
    ${PAD.map(
      (item) => html`<button
        type="button"
        class="icon-button pad-${item.dir}"
        aria-label=${t(item.text)}
        ?disabled=${disabled}
        @click=${() => onDir(item.dir)}
      >
        ${icon(item.icon, 22)}
      </button>`,
    )}
  </div>`;
}
