// Buttons that appear under the finger (e.g. after the solving tap): many puzzles move on pointerup, the app renders
// at once, and the click that follows lands on whatever is there now. A guarded control only counts a click whose
// press started on it. Keyboard clicks (Enter, Space; `detail` 0) always count.

const pressed = new WeakSet<EventTarget>();

/** Put on the control as `@pointerdown`. */
export function markPress(e: PointerEvent): void {
  if (e.currentTarget) pressed.add(e.currentTarget);
}

/** Wraps a click handler as `@click`; a click without a press on this control is dropped (links do not navigate). */
export function guarded(onClick: (e: MouseEvent) => void = () => {}) {
  return (e: MouseEvent) => {
    const target = e.currentTarget;
    const counts = e.detail === 0 || (target !== null && pressed.has(target));
    if (target) pressed.delete(target);
    if (!counts) {
      e.preventDefault();
      return;
    }
    onClick(e);
  };
}
